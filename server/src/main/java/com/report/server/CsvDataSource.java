package com.report.server;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parses CSV text into a list of row maps (header → value).
 *
 * <p>Supports:
 * <ul>
 *   <li>RFC 4180 quoting (double-quote enclosure, escaped quotes)</li>
 *   <li>Windows (CRLF) and Unix (LF) line endings</li>
 *   <li>Japanese text (UTF-8)</li>
 *   <li>Empty fields and short rows (padded with "")</li>
 * </ul>
 *
 * <p>Row count is limited to {@value #MAX_ROWS} to prevent resource exhaustion.
 */
public final class CsvDataSource {

    static final int MAX_ROWS = 10_000;

    private CsvDataSource() {}

    /**
     * Parse CSV text into a list of row maps.
     *
     * @param csvText the full CSV string including header row
     * @return list of maps, one per data row, keyed by trimmed header names
     * @throws IllegalArgumentException if row count exceeds {@value #MAX_ROWS}
     */
    public static List<Map<String, String>> parse(String csvText) {
        if (csvText == null || csvText.isBlank()) {
            return List.of();
        }

        List<List<String>> records = parseCsvRecords(csvText);
        if (records.isEmpty()) {
            return List.of();
        }

        // First record is the header
        List<String> headers = records.get(0).stream()
                .map(String::trim)
                .toList();

        List<Map<String, String>> result = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            if (result.size() >= MAX_ROWS) {
                throw new IllegalArgumentException(
                    "CSV exceeds maximum row count of " + MAX_ROWS);
            }
            List<String> fields = records.get(i);
            Map<String, String> row = new LinkedHashMap<>();
            for (int j = 0; j < headers.size(); j++) {
                row.put(headers.get(j), j < fields.size() ? fields.get(j) : "");
            }
            result.add(row);
        }
        return result;
    }

    /**
     * Low-level RFC 4180 CSV parser.
     * Returns a list of records, each record being a list of field strings.
     */
    private static List<List<String>> parseCsvRecords(String text) {
        List<List<String>> records = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new StringReader(text))) {
            StringBuilder field = new StringBuilder();
            List<String> currentRecord = new ArrayList<>();
            boolean inQuotes = false;

            int ch;
            while ((ch = reader.read()) != -1) {
                if (inQuotes) {
                    if (ch == '"') {
                        int next = reader.read();
                        if (next == '"') {
                            // Escaped quote
                            field.append('"');
                        } else {
                            // End of quoted field
                            inQuotes = false;
                            if (next == ',') {
                                currentRecord.add(field.toString());
                                field.setLength(0);
                            } else if (next == '\r') {
                                // possible CRLF
                                reader.mark(1);
                                int afterCr = reader.read();
                                if (afterCr != '\n') reader.reset();
                                currentRecord.add(field.toString());
                                field.setLength(0);
                                addNonEmptyRecord(records, currentRecord);
                                currentRecord = new ArrayList<>();
                            } else if (next == '\n' || next == -1) {
                                currentRecord.add(field.toString());
                                field.setLength(0);
                                addNonEmptyRecord(records, currentRecord);
                                currentRecord = new ArrayList<>();
                            } else {
                                // Malformed: content after closing quote
                                field.append((char) next);
                            }
                        }
                    } else {
                        field.append((char) ch);
                    }
                } else {
                    if (ch == '"') {
                        inQuotes = true;
                    } else if (ch == ',') {
                        currentRecord.add(field.toString());
                        field.setLength(0);
                    } else if (ch == '\r') {
                        reader.mark(1);
                        int afterCr = reader.read();
                        if (afterCr != '\n') reader.reset();
                        currentRecord.add(field.toString());
                        field.setLength(0);
                        addNonEmptyRecord(records, currentRecord);
                        currentRecord = new ArrayList<>();
                    } else if (ch == '\n') {
                        currentRecord.add(field.toString());
                        field.setLength(0);
                        addNonEmptyRecord(records, currentRecord);
                        currentRecord = new ArrayList<>();
                    } else {
                        field.append((char) ch);
                    }
                }
            }

            // Handle last field/record
            if (!currentRecord.isEmpty() || field.length() > 0) {
                currentRecord.add(field.toString());
                addNonEmptyRecord(records, currentRecord);
            }
        } catch (IOException e) {
            // StringReader should not throw IOException
            throw new RuntimeException("Unexpected IO error parsing CSV", e);
        }
        return records;
    }

    private static void addNonEmptyRecord(List<List<String>> records, List<String> record) {
        // Skip completely empty lines (single empty field)
        if (record.size() == 1 && record.get(0).isEmpty()) {
            return;
        }
        records.add(record);
    }
}
