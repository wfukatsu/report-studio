package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Group page-break plan, group headers, and carry-over totals for paginating sections (issue #55).
 * Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class PagePlanBuilder {

    private PagePlanBuilder() {}

    /**
     * Build the per-physical-page row plan for a paginating section.
     *
     * <p>Without {@code groupBy}: contiguous {@code rowsPerPage} slices. With {@code groupBy}: rows
     * are partitioned by that field's value (in row order), each group is paginated independently,
     * and **groups never share a page** — i.e. every group starts on a fresh physical page. The
     * first page of each group is flagged so a group header can be drawn.
     */
    static java.util.List<SectionRenderHelper.PageSlice> buildPagePlan(
            JsonNode section, JsonNode formData, int rowsPerPage) {
        int total = 0;
        String groupName = findRowGroupName(section);
        JsonNode rows = (formData != null && groupName != null) ? formData.get(groupName) : null;
        if (rows != null && rows.isArray()) total = rows.size();

        java.util.List<SectionRenderHelper.PageSlice> plan = new java.util.ArrayList<>();
        int rpp = Math.max(rowsPerPage, 1);
        String groupBy = PdfUtils.elementTextOf(section, "groupBy", "");

        if (groupBy.isEmpty() || rows == null) {
            // Flat pagination
            if (total == 0) {
                plan.add(new SectionRenderHelper.PageSlice(0, 0, true, null));
                return plan;
            }
            for (int start = 0; start < total; start += rpp) {
                plan.add(
                        new SectionRenderHelper.PageSlice(
                                start, Math.min(start + rpp, total), start == 0, null));
            }
            return plan;
        }

        // Grouped pagination — page breaks at each group boundary
        int groupStart = 0;
        while (groupStart < total) {
            String gv = valueAt(rows, groupStart, groupBy);
            int groupEnd = groupStart;
            while (groupEnd < total
                    && java.util.Objects.equals(valueAt(rows, groupEnd, groupBy), gv)) {
                groupEnd++;
            }
            for (int s = groupStart; s < groupEnd; s += rpp) {
                plan.add(
                        new SectionRenderHelper.PageSlice(
                                s, Math.min(s + rpp, groupEnd), s == groupStart, gv));
            }
            groupStart = groupEnd;
        }
        return plan.isEmpty()
                ? java.util.List.of(new SectionRenderHelper.PageSlice(0, 0, true, null))
                : plan;
    }

    private static String valueAt(JsonNode rows, int idx, String field) {
        JsonNode v = rows.get(idx).get(field);
        return v == null || v.isNull() ? "" : v.asText("");
    }

    /**
     * Render a group-header element ({@code kind: "group_header"}) with the current group's value,
     * on the first page of each group (issue #55). Fields: {@code prefix}/{@code suffix} text,
     * {@code style}.
     */
    static void renderGroupHeader(
            PageContext ctx, JsonNode section, SectionRenderHelper.PageSlice slice) {
        if (!slice.groupFirstPage() || slice.groupValue() == null) return;
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return;
        for (JsonNode el : elements) {
            if (!"group_header".equals(ElementNodeSupport.resolveKind(el))) continue;
            String text =
                    PdfUtils.elementTextOf(el, "prefix", "")
                            + slice.groupValue()
                            + PdfUtils.elementTextOf(el, "suffix", "");
            ElementRenderDispatcher.renderElement(
                    ctx,
                    ElementNodeSupport.withResolvedProp(
                            el, com.fasterxml.jackson.databind.node.TextNode.valueOf(text)));
        }
    }

    /**
     * Render carry-over elements of a paginating section (帳票の繰越小計).
     *
     * <p>Two special element kinds, positioned by their own frames:
     *
     * <ul>
     *   <li>{@code carryover_footer} — drawn on every page that has more rows coming (「次頁へ続く」);
     *       value = sum of rows [0, endRow)
     *   <li>{@code carryover_header} — drawn on continuation pages (「前頁より繰越」); value = sum of rows
     *       [0, startRow)
     * </ul>
     *
     * <p>Element fields: {@code carryField} (field name inside the row group, required; values must
     * be numeric), optional {@code prefix} / {@code suffix} text, optional {@code format}
     * (CalculationFormat), {@code style} (TextStyle).
     */
    static void renderCarryOverElements(
            PageContext ctx,
            JsonNode section,
            JsonNode formData,
            int startRow,
            int endRow,
            int totalRows) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray() || formData == null) return;
        String group = findRowGroupName(section);
        if (group == null) return;
        JsonNode rows = formData.get(group);
        if (rows == null || !rows.isArray()) return;

        for (JsonNode el : elements) {
            String kind = ElementNodeSupport.resolveKind(el);
            boolean footer = "carryover_footer".equals(kind);
            boolean header = "carryover_header".equals(kind);
            if (!footer && !header) continue;
            if (footer && endRow >= totalRows) continue; // final page — nothing continues
            if (header && startRow == 0) continue; // first page — nothing carried

            String field = PdfUtils.elementTextOf(el, "carryField", "");
            if (field.isEmpty()) continue;

            double sum = 0;
            int limit = Math.min(footer ? endRow : startRow, rows.size());
            for (int i = 0; i < limit; i++) {
                JsonNode v = rows.get(i).get(field);
                if (v == null) continue;
                if (v.isNumber()) {
                    sum += v.asDouble();
                } else if (v.isTextual()) {
                    try {
                        sum += Double.parseDouble(v.asText().trim());
                    } catch (NumberFormatException ignored) {
                        // non-numeric row value — skip
                    }
                }
            }

            JsonNode numNode =
                    (sum == Math.rint(sum) && Math.abs(sum) < 1e15)
                            ? com.fasterxml.jackson.databind.node.LongNode.valueOf((long) sum)
                            : com.fasterxml.jackson.databind.node.DoubleNode.valueOf(sum);
            String text =
                    PdfUtils.elementTextOf(el, "prefix", "")
                            + com.report.server.ValueFormatter.applyFormat(
                                    numNode, el.get("format"))
                            + PdfUtils.elementTextOf(el, "suffix", "");
            ElementRenderDispatcher.renderElement(
                    ctx,
                    ElementNodeSupport.withResolvedProp(
                            el, com.fasterxml.jackson.databind.node.TextNode.valueOf(text)));
        }
    }

    /** Group name from the first row_block bindingRef ({@code group[].field}). */
    static String findRowGroupName(JsonNode section) {
        JsonNode elements = section.get("elements");
        if (elements == null || !elements.isArray()) return null;
        for (JsonNode el : elements) {
            if (!"row_block".equals(ElementNodeSupport.resolveKind(el))) continue;
            JsonNode ref = el.get("bindingRef");
            if (ref != null && ref.isTextual() && ref.asText().contains("[]")) {
                return ref.asText().split("\\[\\]")[0];
            }
        }
        return null;
    }
}
