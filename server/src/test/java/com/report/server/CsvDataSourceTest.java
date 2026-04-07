package com.report.server;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class CsvDataSourceTest {

    @Test
    void parsesSimpleCsv() {
        String csv = """
            name,age,address
            田中太郎,30,東京都
            佐藤花子,25,大阪府
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(2, rows.size());
        assertEquals("田中太郎", rows.get(0).get("name"));
        assertEquals("30", rows.get(0).get("age"));
        assertEquals("東京都", rows.get(0).get("address"));
        assertEquals("佐藤花子", rows.get(1).get("name"));
        assertEquals("25", rows.get(1).get("age"));
        assertEquals("大阪府", rows.get(1).get("address"));
    }

    @Test
    void handlesQuotedFields() {
        String csv = """
            name,description
            "田中,太郎","住所は""東京""です"
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(1, rows.size());
        assertEquals("田中,太郎", rows.get(0).get("name"));
        assertEquals("住所は\"東京\"です", rows.get(0).get("description"));
    }

    @Test
    void handlesEmptyFields() {
        String csv = """
            name,age,address
            田中太郎,,東京都
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(1, rows.size());
        assertEquals("田中太郎", rows.get(0).get("name"));
        assertEquals("", rows.get(0).get("age"));
        assertEquals("東京都", rows.get(0).get("address"));
    }

    @Test
    void trimsHeaderWhitespace() {
        String csv = """
            name , age , address\s
            田中太郎,30,東京都
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(1, rows.size());
        assertTrue(rows.get(0).containsKey("name"));
        assertTrue(rows.get(0).containsKey("age"));
        assertTrue(rows.get(0).containsKey("address"));
    }

    @Test
    void returnsEmptyListForHeaderOnly() {
        String csv = "name,age,address\n";

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertTrue(rows.isEmpty());
    }

    @Test
    void returnsEmptyListForEmptyInput() {
        List<Map<String, String>> rows = CsvDataSource.parse("");
        assertTrue(rows.isEmpty());
    }

    @Test
    void skipsEmptyLines() {
        String csv = """
            name,age
            田中太郎,30

            佐藤花子,25
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(2, rows.size());
    }

    @Test
    void handlesWindowsLineEndings() {
        String csv = "name,age\r\n田中太郎,30\r\n佐藤花子,25\r\n";

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(2, rows.size());
        assertEquals("田中太郎", rows.get(0).get("name"));
    }

    @Test
    void handlesFewColumnsInRow() {
        String csv = """
            name,age,address
            田中太郎,30
            """;

        List<Map<String, String>> rows = CsvDataSource.parse(csv);

        assertEquals(1, rows.size());
        assertEquals("田中太郎", rows.get(0).get("name"));
        assertEquals("30", rows.get(0).get("age"));
        assertEquals("", rows.get(0).get("address"));
    }

    @Test
    void rejectsExcessiveRows() {
        StringBuilder csv = new StringBuilder("name\n");
        for (int i = 0; i < 10_001; i++) {
            csv.append("row").append(i).append("\n");
        }

        assertThrows(IllegalArgumentException.class, () -> CsvDataSource.parse(csv.toString()));
    }
}
