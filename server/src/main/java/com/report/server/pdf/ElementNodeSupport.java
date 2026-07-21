package com.report.server.pdf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Shared element-node utilities for the pdf package: kind/binding resolution, resolved-prop
 * copying, and variant masking. Extracted from SectionRenderHelper (#276) — no behavior change.
 */
final class ElementNodeSupport {

    static final ObjectMapper MAPPER = new ObjectMapper();

    private ElementNodeSupport() {}

    static JsonNode withResolvedProp(JsonNode el, JsonNode value) {
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode props =
                    copy.has("props") && copy.get("props").isObject()
                            ? (ObjectNode) copy.get("props")
                            : MAPPER.createObjectNode();
            String kind = resolveKind(el);
            String propKey = propKeyFor(kind);
            applyValue(props, propKey, value);
            copy.set("props", props);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    static String resolveKind(JsonNode el) {
        String type = PdfUtils.textOf(el, "type", "");
        // The V2 `barcode` element carries a `kind` field that is a barcode
        // FORMAT (qr / code128 / code39 / jan13), not an element kind. Left to
        // the generic rule below it would shadow the type and route to a
        // non-existent "code128" renderer (blank box) — issue #182. Map it to
        // the actual renderer kind here instead.
        if ("barcode".equals(type)) {
            return "qr".equalsIgnoreCase(PdfUtils.textOf(el, "kind", "")) ? "qrcode" : "barcode";
        }
        String kind = PdfUtils.textOf(el, "kind", "");
        return kind.isEmpty() ? type : kind;
    }

    /**
     * Resolve the element's data-binding key. V1/V2 shared elements use {@code bindingRef}; some V2
     * types carry their own field: eraSelect ({@code dataSource}) and hanko ({@code binding}).
     * Returns null when the element has no binding.
     */
    static String resolveBindingRef(JsonNode el) {
        JsonNode bindingRefNode = el.get("bindingRef");
        if (bindingRefNode != null && bindingRefNode.isTextual()) return bindingRefNode.asText();
        String kind = resolveKind(el);
        String v2Field =
                switch (kind) {
                    case "eraSelect" -> "dataSource";
                    case "hanko" -> "binding";
                    case "dataField" -> "fieldKey";
                    case "manualEntry" -> "furiganaDataSource";
                    default -> null;
                };
        if (v2Field == null) return null;
        JsonNode node = el.get(v2Field);
        return node != null && node.isTextual() && !node.asText().isBlank() ? node.asText() : null;
    }

    static String propKeyFor(String kind) {
        return switch (kind) {
            case "checkbox" -> "checked";
            case "radio_mark" -> "selected";
            case "barcode", "qrcode" -> "value";
            default -> "text";
        };
    }

    static void applyValue(ObjectNode props, String propKey, JsonNode value) {
        if (value.isTextual()) {
            props.put(propKey, value.asText());
        } else if (value.isNumber()) {
            // Integral values print without ".0" — BigDecimal calc results
            // (issue #57) and JSON doubles like 450.0 both become "450"
            double d = value.asDouble();
            props.put(
                    propKey,
                    (d == Math.rint(d) && Math.abs(d) < 1e15)
                            ? String.valueOf((long) d)
                            : String.valueOf(d));
        } else if (value.isBoolean()) {
            props.put(propKey, value.asBoolean());
        }
    }

    /**
     * Apply masking rules from a VariantContext to an element's text/value prop. Returns the
     * original node if no masking rule applies.
     */
    static JsonNode applyMaskingToElement(JsonNode el, VariantContext variantCtx) {
        String elId = PdfUtils.textOf(el, "id", "");
        if (elId.isBlank()) return el;
        String kind = resolveKind(el);
        String propKey = propKeyFor(kind);
        JsonNode props = el.get("props");
        if (props == null || !props.isObject()) return el;
        JsonNode valueProp = props.get(propKey);
        String originalValue = valueProp != null ? valueProp.asText(null) : null;
        if (originalValue == null) return el;
        String maskedValue = variantCtx.applyMasking(elId, originalValue);
        if (maskedValue.equals(originalValue)) return el;
        try {
            ObjectNode copy = (ObjectNode) el.deepCopy();
            ObjectNode propsCopy = (ObjectNode) copy.get("props");
            propsCopy.put(propKey, maskedValue);
            return copy;
        } catch (Exception e) {
            return el;
        }
    }

    /** Element height in mm — V1 {@code frame.height} or V2 {@code size.height}. */
    static float elementHeightMm(JsonNode el) {
        JsonNode frame = el.get("frame");
        if (frame != null && frame.isObject()) return PdfUtils.floatOf(frame, "height");
        JsonNode size = el.get("size");
        return size != null && size.isObject() ? PdfUtils.floatOf(size, "height") : 0f;
    }
}
