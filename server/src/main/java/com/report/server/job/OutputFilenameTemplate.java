package com.report.server.job;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Output filename templating for batch PDF ZIP entries (issue #194).
 *
 * <p>Pure, stateless string logic extracted from the batch controller (issue #420) so it can be
 * unit-tested in isolation.
 */
final class OutputFilenameTemplate {

    private static final java.util.regex.Pattern TOKEN =
            java.util.regex.Pattern.compile("\\{([^{}]+)\\}");

    private OutputFilenameTemplate() {}

    /**
     * Build the ZIP entry name for one item. With no template, falls back to the historical {@code
     * NNN_yyyyMMdd.pdf} form. Tokens: {@code {seq}}, {@code {date}}, {@code {documentNo}}/{@code
     * {documentNumber}}, {@code {status}}, and any dot-notation data field (e.g. {@code
     * {customer.name}}). Unknown tokens resolve to empty. Result is sanitized and always ends in
     * {@code .pdf}.
     */
    static String buildFilename(
            String template,
            String seqStr,
            String dateStr,
            String documentNumber,
            String status,
            JsonNode data) {
        if (template == null || template.isBlank()) {
            return seqStr + "_" + dateStr + ".pdf";
        }
        Map<String, String> flat = new HashMap<>();
        flattenLeaves(data, "", flat);
        java.util.regex.Matcher m = TOKEN.matcher(template);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String key = m.group(1).trim();
            String value =
                    switch (key) {
                        case "seq" -> seqStr;
                        case "date" -> dateStr;
                        case "documentNo", "documentNumber" ->
                                documentNumber == null ? "" : documentNumber;
                        case "status" -> status == null ? "" : status;
                        default -> flat.getOrDefault(key, "");
                    };
            m.appendReplacement(sb, java.util.regex.Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        // Strip a template-supplied .pdf before sanitizing so trailing underscores from
        // empty tokens (e.g. "{missing}_A_{missing}.pdf") don't cling to the extension.
        String base = sanitizeFilename(sb.toString().replaceAll("(?i)\\.pdf$", ""));
        if (base.isBlank()) base = seqStr + "_" + dateStr;
        return base + ".pdf";
    }

    /** Replace path separators and characters unsafe in ZIP entry / OS filenames. */
    static String sanitizeFilename(String raw) {
        String s =
                raw.replace('/', '_')
                        .replace('\\', '_')
                        .replaceAll("[\\x00-\\x1f<>:\"|?*]", "_")
                        .trim();
        // Collapse redundant underscores, strip a trailing dot, and trim stray edges.
        s = s.replaceAll("_{2,}", "_").replaceAll("\\.+$", "").replaceAll("^_+|_+$", "");
        if (s.length() > 180) s = s.substring(0, 180);
        return s;
    }

    /** Ensure uniqueness within the ZIP by suffixing collisions with a counter. */
    static String uniqueName(Set<String> used, String name) {
        if (used.add(name)) return name;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 2; ; i++) {
            String candidate = base + "_" + i + ext;
            if (used.add(candidate)) return candidate;
        }
    }

    /** Flatten scalar leaves of a JSON object into dot-notation keys for token lookup. */
    private static void flattenLeaves(JsonNode node, String prefix, Map<String, String> out) {
        if (node == null || !node.isObject()) return;
        var fields = node.fields();
        while (fields.hasNext()) {
            var f = fields.next();
            String key = prefix.isEmpty() ? f.getKey() : prefix + "." + f.getKey();
            JsonNode v = f.getValue();
            if (v.isObject()) {
                flattenLeaves(v, key, out);
            } else if (!v.isArray()) {
                out.put(key, v.asText(""));
            }
        }
    }
}
