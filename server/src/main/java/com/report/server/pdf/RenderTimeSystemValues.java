package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Render-time system/tenant value resolution (issue #54): page numbers, print dates, and tenant*
 * elements. Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class RenderTimeSystemValues {

    private RenderTimeSystemValues() {}

    /**
     * Resolve render-time system values into the element's value prop: pageNumber / currentDate
     * elements format themselves from the page context, and legacy {@code {pageNumber}} / {@code
     * {totalPages}} / {@code {currentDate}} bindingRefs substitute their current value.
     */
    static JsonNode resolveSystemValues(JsonNode el, PageContext ctx) {
        String kind = ElementNodeSupport.resolveKind(el);
        if (kind.startsWith("tenant")) {
            return resolveTenantElement(el, kind, ctx.tenant());
        }
        String value = null;
        if ("pageNumber".equals(kind)) {
            value =
                    SystemValueResolver.formatPageNumber(
                            PdfUtils.elementTextOf(el, "format", "{{page}}"),
                            PdfUtils.elementTextOf(el, "customFormat", ""),
                            ctx.pageIndex() + 1,
                            ctx.totalPages());
        } else if ("currentDate".equals(kind)) {
            value =
                    SystemValueResolver.formatCurrentDate(
                            PdfUtils.elementTextOf(el, "format", ""),
                            PdfUtils.elementTextOf(el, "customFormat", ""),
                            ctx.printDate());
        } else {
            JsonNode ref = el.get("bindingRef");
            if (ref != null && ref.isTextual()) {
                switch (ref.asText()) {
                    case "{pageNumber}" -> value = String.valueOf(ctx.pageIndex() + 1);
                    case "{totalPages}" -> value = String.valueOf(ctx.totalPages());
                    case "{currentDate}" ->
                            value =
                                    SystemValueResolver.formatCurrentDate(
                                            "yyyy/MM/dd", null, ctx.printDate());
                    default -> {
                        /* not a system variable */
                    }
                }
            }
        }
        if (value == null) return el;
        return ElementNodeSupport.withResolvedProp(
                el, com.fasterxml.jackson.databind.node.TextNode.valueOf(value));
    }

    /**
     * Resolve V2 tenant* elements from the TenantInfo document (issue #54). Text elements fall back
     * to the element's {@code fallback} when the tenant field is unset; tenantLogo is rewritten to
     * an {@code image} element so ImagePdfRenderer handles the data-URI.
     */
    private static JsonNode resolveTenantElement(JsonNode el, String kind, JsonNode tenant) {
        if ("tenantLogo".equals(kind)) {
            String src = tenant != null ? PdfUtils.textOf(tenant, "logoBase64", "") : "";
            if (src.isEmpty())
                return el; // no logo — image renderer draws nothing useful; keep fallback box
            try {
                ObjectNode copy = (ObjectNode) el.deepCopy();
                copy.put("kind", "image");
                ObjectNode props =
                        copy.has("props") && copy.get("props").isObject()
                                ? (ObjectNode) copy.get("props")
                                : ElementNodeSupport.MAPPER.createObjectNode();
                props.put("src", src);
                if (el.hasNonNull("objectFit"))
                    props.put("objectFit", el.get("objectFit").asText());
                if (el.hasNonNull("opacity")) props.put("opacity", el.get("opacity").asDouble());
                copy.set("props", props);
                return copy;
            } catch (Exception e) {
                return el;
            }
        }

        String value =
                tenant == null
                        ? ""
                        : switch (kind) {
                            case "tenantCompanyName" -> PdfUtils.textOf(tenant, "companyName", "");
                            case "tenantAddress" -> {
                                boolean multiline =
                                        "multiLine"
                                                .equals(
                                                        PdfUtils.elementTextOf(
                                                                el, "displayMode", "single"));
                                yield com.report.server.ValueFormatter.formatAddress(
                                        tenant, multiline);
                            }
                            case "tenantPhone" -> PdfUtils.textOf(tenant, "phone", "");
                            case "tenantRepresentative" ->
                                    PdfUtils.textOf(tenant, "representativeName", "");
                            case "tenantCustom" -> {
                                String fieldKey = PdfUtils.elementTextOf(el, "fieldKey", "");
                                JsonNode custom = tenant.get("custom");
                                yield custom != null && !fieldKey.isEmpty()
                                        ? PdfUtils.textOf(custom, fieldKey, "")
                                        : "";
                            }
                            default -> "";
                        };
        if (value.isEmpty()) {
            value = PdfUtils.elementTextOf(el, "fallback", "");
        }
        return ElementNodeSupport.withResolvedProp(
                el, com.fasterxml.jackson.databind.node.TextNode.valueOf(value));
    }
}
