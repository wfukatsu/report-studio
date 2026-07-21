package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Form-data binding resolution: scalar bindings, array-bound elements, and row-indexed detail
 * bindings. Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class FormDataResolver {

    private FormDataResolver() {}

    /**
     * Resolve scalar form data bindings into element props. Master fields: "group.field" →
     * _formData["group.field"] Detail fields (first row only): "group[].field" →
     * _formData.group[0].field
     */
    static JsonNode resolveFormData(JsonNode el, JsonNode formData) {
        // Array-bound elements copy a whole _formData array into props.data:
        // chart (dataBinding), repeatingBand / repeatingList (dataSource)
        String kind = ElementNodeSupport.resolveKind(el);
        if ("chart".equals(kind)) {
            return resolveArrayData(el, formData, "dataBinding");
        }
        if ("repeatingBand".equals(kind) || "repeatingList".equals(kind)) {
            return resolveArrayData(el, formData, "dataSource");
        }
        // formTable resolves dataField cells from an element-level _formData;
        // production only sets it on the projection root, so inject it here so
        // dataField cells are no longer blank in server PDFs (issue #52/#53)
        if ("formTable".equals(kind) && el.get("_formData") == null && formData != null) {
            try {
                ObjectNode copy = (ObjectNode) el.deepCopy();
                copy.set("_formData", formData.deepCopy());
                return copy;
            } catch (Exception e) {
                return el;
            }
        }
        String ref = ElementNodeSupport.resolveBindingRef(el);
        if (ref == null) return el;
        if (ref.startsWith("{")) return el; // system variable — resolved at render time

        JsonNode value = null;
        if (ref.contains("[]")) {
            String[] parts = ref.split("\\[\\]\\.");
            if (parts.length == 2) {
                JsonNode group = formData.get(parts[0]);
                if (group != null && group.isArray() && !group.isEmpty()) {
                    value = group.get(0).get(parts[1]);
                }
            }
        } else {
            value = resolveDataPath(formData, ref);
        }

        if (value == null) return el;
        return ElementNodeSupport.withResolvedProp(el, value);
    }

    /** Copy the bound data array ({@code field} → {@code _formData[key]}) into props.data. */
    private static JsonNode resolveArrayData(JsonNode el, JsonNode formData, String field) {
        String key = PdfUtils.elementTextOf(el, field, "");
        if (key.isEmpty() || formData == null) return el;
        JsonNode arr = formData.get(key);
        if (arr == null || !arr.isArray()) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode props =
                    copy.has("props") && copy.get("props").isObject()
                            ? (ObjectNode) copy.get("props")
                            : ElementNodeSupport.MAPPER.createObjectNode();
            props.set("data", arr.deepCopy());
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    /**
     * Position-explicit variant (issue #55): the value comes from data row {@code rowIdx}, but the
     * Y offset uses {@code rowOnPage} — the row's slot on the current physical page. This lets a
     * group's first page start at slot 0 even when its data index does not align to a rowsPerPage
     * boundary.
     */
    static JsonNode resolveDetailRowAt(
            JsonNode el, JsonNode formData, int rowIdx, int rowOnPage, float strideMm) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode == null || !bindingRefNode.isTextual() || formData == null) return el;
        String ref = bindingRefNode.asText();
        if (!ref.contains("[]")) return el;

        String[] parts = ref.split("\\[\\]\\.");
        if (parts.length != 2) return el;

        JsonNode group = formData.get(parts[0]);
        if (group == null || !group.isArray() || rowIdx >= group.size()) return el;

        JsonNode value = group.get(rowIdx).get(parts[1]);
        if (value == null) return el;

        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            // Offset Y by the row's slot on the current page
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) {
                ObjectNode frameCopy = (ObjectNode) frame;
                float stride =
                        Float.isNaN(strideMm) || strideMm <= 0
                                ? PdfUtils.floatOf(frame, "height")
                                : strideMm;
                float baseY = PdfUtils.floatOf(frame, "y");
                frameCopy.put("y", baseY + stride * rowOnPage);
            }
            // Set the resolved value into props
            ObjectNode props =
                    copy.has("props") && copy.get("props").isObject()
                            ? (ObjectNode) copy.get("props")
                            : ElementNodeSupport.MAPPER.createObjectNode();
            String kind = ElementNodeSupport.resolveKind(el);
            String propKey = ElementNodeSupport.propKeyFor(kind);
            ElementNodeSupport.applyValue(props, propKey, value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    /** Copy a row_block with record {@code recordIdx}'s value and an absolute frame.y. */
    static JsonNode resolveRowValueAtY(JsonNode el, JsonNode formData, int recordIdx, float yMm) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode == null || !bindingRefNode.isTextual() || formData == null) return el;
        String ref = bindingRefNode.asText();
        if (!ref.contains("[]")) return el;
        String[] parts = ref.split("\\[\\]\\.");
        if (parts.length != 2) return el;
        JsonNode group = formData.get(parts[0]);
        if (group == null || !group.isArray() || recordIdx >= group.size()) return el;
        JsonNode value = group.get(recordIdx).get(parts[1]);
        if (value == null) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            JsonNode frame = copy.get("frame");
            if (frame != null && frame.isObject()) ((ObjectNode) frame).put("y", yMm);
            ObjectNode props =
                    copy.has("props") && copy.get("props").isObject()
                            ? (ObjectNode) copy.get("props")
                            : ElementNodeSupport.MAPPER.createObjectNode();
            ElementNodeSupport.applyValue(
                    props,
                    ElementNodeSupport.propKeyFor(ElementNodeSupport.resolveKind(el)),
                    value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    /**
     * Resolve a scalar data reference: exact key first (legacy flat projection data), then
     * dot-notation traversal into nested objects — mirroring the frontend {@code resolveField}
     * (e.g. {@code "document.documentNo"} into {@code {document: {documentNo: ...}}}). Returns null
     * when unresolved.
     */
    static JsonNode resolveDataPath(JsonNode data, String ref) {
        if (data == null || ref == null || ref.isEmpty()) return null;
        JsonNode direct = data.get(ref);
        if (direct != null && !direct.isNull()) return direct;
        if (!ref.contains(".")) return null;
        JsonNode cur = data;
        for (String part : ref.split("\\.")) {
            if (cur == null || !cur.isObject()) return null;
            cur = cur.get(part);
        }
        return (cur == null || cur.isNull()) ? null : cur;
    }
}
