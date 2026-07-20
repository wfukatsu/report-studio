package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Server-side port of the frontend value formatter (issues #53/#57).
 *
 * <p>Byte-compatible with {@code src/lib/numberFormatter.ts}: number formats
 * (integer/decimal/currency/percent/comma/kanji_numeral/custom pattern), date formats (yyyy/MM/dd,
 * yyyy年MM月dd日, MM/dd/yyyy, 和暦 full/short, custom pattern), and address formats. The cross-language
 * contract is pinned by ValueFormatterTest, which mirrors numberFormatter.test.ts fixtures.
 *
 * <p>Divergences (documented): dates are parsed timezone-free (matches the frontend's behavior on a
 * JST machine); non-numeric strings that merely start with digits are not number-parsed (JS {@code
 * parseFloat} prefix semantics are not replicated).
 */
public final class ValueFormatter {

    private ValueFormatter() {}

    // ── 和暦 era table (mirror of ERA_TABLE) ───────────────────────────

    private record Era(String name, String abbr, LocalDate start) {}

    private static final List<Era> ERA_TABLE =
            List.of(
                    new Era("令和", "R", LocalDate.of(2019, 5, 1)),
                    new Era("平成", "H", LocalDate.of(1989, 1, 8)),
                    new Era("昭和", "S", LocalDate.of(1926, 12, 25)),
                    new Era("大正", "T", LocalDate.of(1912, 7, 30)),
                    new Era("明治", "M", LocalDate.of(1868, 1, 25)));

    private static final List<String> DATE_TYPES =
            List.of("yyyy/MM/dd", "yyyy年MM月dd日", "MM/dd/yyyy", "wareki_full", "wareki_short");

    private static final DecimalFormatSymbols US_SYMBOLS =
            DecimalFormatSymbols.getInstance(Locale.US);

    // ── Generic entry point (mirror of applyFormat) ────────────────────

    /**
     * Format a resolved raw value with a {@code CalculationFormat} JSON node ({@code {type,
     * decimalPlaces?, customPattern?}}). Null-safe on both sides.
     */
    public static String applyFormat(JsonNode value, JsonNode format) {
        if (value == null || value.isNull() || value.isMissingNode()) return "";
        if (format == null || format.isNull() || format.isMissingNode()) {
            return rawToString(value);
        }
        String type = format.path("type").asText("");

        if ("address_single".equals(type) || "address_multiline".equals(type)) {
            if (value.isObject()) {
                return formatAddress(value, "address_multiline".equals(type));
            }
            return rawToString(value);
        }

        String raw = rawToString(value);
        if (DATE_TYPES.contains(type) || (isDateCustom(type, format) && parseDate(raw) != null)) {
            LocalDate date = parseDate(raw);
            if (date == null) return raw;
            return formatDate(date, type, format.path("customPattern").asText(null));
        }

        Double num = tryParseNumber(value, raw);
        if (num != null) {
            return formatNumber(
                    num,
                    type,
                    format.path("decimalPlaces").asInt(0),
                    format.path("customPattern").asText(null));
        }
        return raw;
    }

    // ── Number formatting (mirror of formatNumber) ─────────────────────

    public static String formatNumber(
            double value, String type, int decimalPlaces, String customPattern) {
        return switch (type) {
            case "integer" -> String.valueOf(Math.round(value));
            case "decimal" -> toFixed(value, decimalPlaces);
            case "currency_jpy" -> "¥" + newGroupedFormat(0, 0).format(value);
            case "currency_usd" -> "$" + newGroupedFormat(2, 2).format(value);
            case "percent" -> toFixed(value * 100, decimalPlaces) + "%";
            case "comma" -> newGroupedFormat(0, 3).format(value);
            case "kanji_numeral" -> toKanjiNumeral(value);
            case "custom" ->
                    customPattern != null && !customPattern.isEmpty()
                            ? applyCustomPattern(value, customPattern)
                            : numToString(value);
            default -> numToString(value);
        };
    }

    /** 大字 (mirror of toKanjiNumeral): 1000000 → 金百万円也 */
    public static String toKanjiNumeral(double amount) {
        if (!Double.isFinite(amount) || amount < 0) return numToString(amount);
        long intPart = (long) Math.floor(amount);
        if (intPart == 0) return "金零円也";

        List<Long> groups = new ArrayList<>();
        long remaining = intPart;
        while (remaining > 0) {
            groups.add(remaining % 10000);
            remaining /= 10000;
        }

        String[] bigUnits = {"", "万", "億", "兆"};
        StringBuilder result = new StringBuilder();
        for (int i = groups.size() - 1; i >= 0; i--) {
            long g = groups.get(i);
            if (g == 0) continue;
            result.append(groupToKanji(g)).append(i < bigUnits.length ? bigUnits[i] : "");
        }
        return "金" + result + "円也";
    }

    private static String groupToKanji(long n) {
        String[] digits = {"", "壱", "弐", "参", "四", "伍", "六", "七", "八", "九"};
        String[] smallUnits = {"", "拾", "百", "千"};
        StringBuilder result = new StringBuilder();
        String s = new StringBuilder(String.valueOf(n)).reverse().toString();
        for (int i = 0; i < s.length(); i++) {
            int d = s.charAt(i) - '0';
            if (d == 0) continue;
            String unit = i < smallUnits.length ? smallUnits[i] : "";
            String digit = (i == 0) ? digits[d] : (d == 1 ? "" : digits[d]);
            result.insert(0, digit + unit);
        }
        return result.toString();
    }

    // ── Date formatting (mirror of formatDate / formatWareki) ──────────

    public static String formatDate(LocalDate date, String type, String customPattern) {
        int y = date.getYear();
        int m = date.getMonthValue();
        int d = date.getDayOfMonth();
        return switch (type) {
            case "yyyy/MM/dd" -> "%d/%02d/%02d".formatted(y, m, d);
            case "yyyy年MM月dd日" -> "%d年%d月%d日".formatted(y, m, d);
            case "MM/dd/yyyy" -> "%02d/%02d/%d".formatted(m, d, y);
            case "wareki_full" -> formatWareki(date, false);
            case "wareki_short" -> formatWareki(date, true);
            case "custom" ->
                    customPattern != null && !customPattern.isEmpty()
                            ? applyDatePattern(date, customPattern)
                            : "%d/%02d/%02d".formatted(y, m, d);
            default -> "%d/%02d/%02d".formatted(y, m, d);
        };
    }

    /** 和暦 (mirror of formatWareki): full → 令和8年4月1日 / short → R08.04.01 */
    public static String formatWareki(LocalDate date, boolean shortForm) {
        for (Era era : ERA_TABLE) {
            if (!date.isBefore(era.start())) {
                int year = date.getYear() - era.start().getYear() + 1;
                if (shortForm) {
                    return "%s%02d.%02d.%02d"
                            .formatted(
                                    era.abbr(), year, date.getMonthValue(), date.getDayOfMonth());
                }
                String yy = year == 1 ? "元" : String.valueOf(year);
                return "%s%s年%d月%d日"
                        .formatted(era.name(), yy, date.getMonthValue(), date.getDayOfMonth());
            }
        }
        return "%d/%02d/%02d".formatted(date.getYear(), date.getMonthValue(), date.getDayOfMonth());
    }

    /** Lenient date parse: ISO yyyy-MM-dd, yyyy/MM/dd, or ISO date-time. */
    public static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String s = raw.trim();
        try {
            return LocalDate.parse(s);
        } catch (Exception ignored) {
            /* try next format */
        }
        try {
            return LocalDate.parse(s, DateTimeFormatter.ofPattern("yyyy/MM/dd"));
        } catch (Exception ignored) {
            /* try next format */
        }
        try {
            return java.time.OffsetDateTime.parse(s).toLocalDate();
        } catch (Exception ignored) {
            /* try next format */
        }
        try {
            return java.time.LocalDateTime.parse(s).toLocalDate();
        } catch (Exception ignored) {
            /* give up */
        }
        return null;
    }

    // ── Address formatting (mirror of formatAddress) ───────────────────

    /** {@code 〒{postalCode} {address1}{address2}} — multiline joins with \n. */
    public static String formatAddress(JsonNode obj, boolean multiline) {
        String postalCode = obj.path("postalCode").asText("");
        String addr1 = obj.path("address1").asText("");
        if (addr1.isEmpty()) addr1 = obj.path("address").asText("");
        String addr2 = obj.path("address2").asText("");
        if (postalCode.isEmpty() && addr1.isEmpty() && addr2.isEmpty()) return "";

        if (multiline) {
            List<String> lines = new ArrayList<>();
            if (!postalCode.isEmpty()) lines.add("〒" + postalCode);
            if (!addr1.isEmpty()) lines.add(addr1);
            if (!addr2.isEmpty()) lines.add(addr2);
            return String.join("\n", lines);
        }
        String prefix = postalCode.isEmpty() ? "" : "〒" + postalCode + " ";
        return prefix + addr1 + addr2;
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private static boolean isDateCustom(String type, JsonNode format) {
        // "custom" is shared between number and date formats; treat it as a
        // date pattern only when the pattern contains date tokens.
        if (!"custom".equals(type)) return false;
        String pattern = format.path("customPattern").asText("");
        return pattern.contains("yyyy") || pattern.contains("dd");
    }

    private static Double tryParseNumber(JsonNode value, String raw) {
        if (value.isNumber()) return value.asDouble();
        try {
            return Double.parseDouble(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** JS toFixed equivalent (half-up). */
    private static String toFixed(double value, int decimalPlaces) {
        return BigDecimal.valueOf(value)
                .setScale(decimalPlaces, RoundingMode.HALF_UP)
                .toPlainString();
    }

    /** Grouped decimal format with explicit US symbols (grouping "," / decimal "."). */
    private static DecimalFormat newGroupedFormat(int minFrac, int maxFrac) {
        DecimalFormat df = new DecimalFormat("#,##0", US_SYMBOLS);
        df.setMinimumFractionDigits(minFrac);
        df.setMaximumFractionDigits(maxFrac);
        df.setRoundingMode(RoundingMode.HALF_UP);
        return df;
    }

    /** JS String(number) equivalent: integral doubles print without ".0". */
    private static String numToString(double v) {
        if (Double.isNaN(v)) return "NaN";
        if (Double.isInfinite(v)) return v > 0 ? "Infinity" : "-Infinity";
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return String.valueOf(v);
    }

    private static String rawToString(JsonNode value) {
        if (value.isNumber()) return numToString(value.asDouble());
        return value.isTextual() ? value.asText() : value.asText("");
    }

    /** '#,##0.00'-style pattern (mirror of applyCustomPattern). */
    private static String applyCustomPattern(double value, String pattern) {
        boolean hasComma = pattern.contains(",");
        int decimals = 0;
        int dot = pattern.indexOf('.');
        if (dot >= 0) {
            decimals =
                    (int)
                            pattern.substring(dot + 1)
                                    .chars()
                                    .filter(c -> c == '0' || c == '#')
                                    .count();
        }
        String result =
                hasComma
                        ? newGroupedFormat(decimals, decimals).format(value)
                        : toFixed(value, decimals);
        if (pattern.startsWith("¥") || pattern.startsWith("$")) {
            result = pattern.charAt(0) + result;
        }
        return result;
    }

    /** yyyy/MM/dd/HH/mm token replacement (mirror of applyDatePattern; HH/mm are 00). */
    private static String applyDatePattern(LocalDate date, String pattern) {
        return pattern.replaceFirst("yyyy", String.valueOf(date.getYear()))
                .replaceFirst("MM", "%02d".formatted(date.getMonthValue()))
                .replaceFirst("dd", "%02d".formatted(date.getDayOfMonth()))
                .replaceFirst("HH", "00")
                .replaceFirst("mm", "00");
    }
}
