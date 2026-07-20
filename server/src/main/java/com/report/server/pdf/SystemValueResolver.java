package com.report.server.pdf;

import java.time.LocalDate;

/**
 * Formats the auto-field values — page numbers and print dates — that are only known at render time
 * (issue #54).
 *
 * <p>Ports the frontend formatters exactly:
 *
 * <ul>
 *   <li>{@code src/elements/pageNumber/format.ts} — the format string IS the template ({@code
 *       {{page}}} / {@code {{pages}}} placeholders); {@code "custom"} switches to {@code
 *       customFormat}
 *   <li>{@code src/elements/currentDate/format.ts} — note this dialect zero-pads month/day
 *       (2026年07月16日), unlike CalculationFormat's date formats, and supports a day-of-week token
 * </ul>
 */
public final class SystemValueResolver {

    private static final String[] DAY_NAMES_JA = {"日", "月", "火", "水", "木", "金", "土"};

    private SystemValueResolver() {}

    /** Mirror of formatPageNumber: the format string is the template. */
    public static String formatPageNumber(String format, String customFormat, int page, int pages) {
        String template =
                "custom".equals(format)
                        ? (customFormat != null && !customFormat.isEmpty()
                                ? customFormat
                                : "{{page}}")
                        : (format == null || format.isEmpty() ? "{{page}}" : format);
        return template.replace("{{page}}", String.valueOf(page))
                .replace("{{pages}}", String.valueOf(pages));
    }

    /** Mirror of formatCurrentDate (zero-padded month/day dialect). */
    public static String formatCurrentDate(String format, String customFormat, LocalDate d) {
        int y = d.getYear();
        int m = d.getMonthValue();
        int day = d.getDayOfMonth();
        String f = format == null ? "" : format;
        return switch (f) {
            case "yyyy年MM月dd日" -> "%d年%02d月%02d日".formatted(y, m, day);
            case "yyyy-MM-dd" -> "%d-%02d-%02d".formatted(y, m, day);
            case "MM/dd/yyyy" -> "%02d/%02d/%d".formatted(m, day, y);
            case "wareki_full" -> {
                Wareki w = toWareki(d);
                yield "%s%d年%02d月%02d日".formatted(w.eraName(), w.year(), m, day);
            }
            case "wareki_short" -> {
                Wareki w = toWareki(d);
                yield "%s%d.%02d.%02d".formatted(w.abbr(), w.year(), m, day);
            }
            case "yyyy年MM月dd日 (ddd)" -> "%d年%02d月%02d日 (%s)".formatted(y, m, day, dayName(d));
            case "custom" -> {
                String pattern =
                        customFormat != null && !customFormat.isEmpty()
                                ? customFormat
                                : "yyyy/MM/dd";
                yield pattern.replace("yyyy", String.valueOf(y))
                        .replace("MM", "%02d".formatted(m))
                        .replace("ddd", dayName(d))
                        .replace("dd", "%02d".formatted(day));
            }
            default -> "%d/%02d/%02d".formatted(y, m, day);
        };
    }

    private static String dayName(LocalDate d) {
        // DayOfWeek: MONDAY=1..SUNDAY=7 → JS getDay(): SUNDAY=0..SATURDAY=6
        return DAY_NAMES_JA[d.getDayOfWeek().getValue() % 7];
    }

    private record Wareki(String eraName, String abbr, int year) {}

    private static Wareki toWareki(LocalDate d) {
        record Era(String name, String abbr, LocalDate start) {}
        Era[] eras = {
            new Era("令和", "R", LocalDate.of(2019, 5, 1)),
            new Era("平成", "H", LocalDate.of(1989, 1, 8)),
            new Era("昭和", "S", LocalDate.of(1926, 12, 25)),
            new Era("大正", "T", LocalDate.of(1912, 7, 30)),
            new Era("明治", "M", LocalDate.of(1868, 1, 25)),
        };
        for (Era era : eras) {
            if (!d.isBefore(era.start())) {
                return new Wareki(era.name(), era.abbr(), d.getYear() - era.start().getYear() + 1);
            }
        }
        return new Wareki("西暦", "", d.getYear());
    }
}
