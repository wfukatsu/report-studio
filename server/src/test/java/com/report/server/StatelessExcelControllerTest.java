package com.report.server;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class StatelessExcelControllerTest {

    private static final ObjectMapper M = new ObjectMapper();

    private static JsonNode json(String s) throws Exception {
        return M.readTree(s);
    }

    private static JsonNode templateWithBand(String dataSource) throws Exception {
        return json("""
            { "pages": [ { "sections": [ { "elements": [
              { "type": "repeatingBand", "dataSource": "%s" }
            ] } ] } ] }
            """.formatted(dataSource));
    }

    private static XSSFWorkbook read(byte[] bytes) throws Exception {
        return new XSSFWorkbook(new ByteArrayInputStream(bytes));
    }

    private static List<String> sheetNames(XSSFWorkbook wb) {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < wb.getNumberOfSheets(); i++) names.add(wb.getSheetName(i));
        return names;
    }

    // ── dataSource key collection ────────────────────────────────────────────

    @Test
    void collectDataSourceKeys_findsRepeatingBandSource() throws Exception {
        List<String> keys = StatelessExcelController.collectDataSourceKeys(templateWithBand("items"));
        assertEquals(List.of("items"), keys);
    }

    @Test
    void collectDataSourceKeys_emptyWhenNoRepeatingElement() throws Exception {
        JsonNode tpl = json("{ \"pages\": [ { \"sections\": [ { \"elements\": [ { \"type\": \"text\" } ] } ] } ] }");
        assertTrue(StatelessExcelController.collectDataSourceKeys(tpl).isEmpty());
    }

    // ── workbook contents ────────────────────────────────────────────────────

    @Test
    void buildWorkbook_scalarsAndTableSheets() throws Exception {
        JsonNode tpl = templateWithBand("items");
        JsonNode data = json("""
            { "invoiceNo": "INV-1", "total": 154000,
              "items": [ { "code": "A", "qty": 2 }, { "code": "B", "qty": 3 } ] }
            """);

        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, data))) {
            assertEquals(List.of("項目", "items"), sheetNames(wb));

            Sheet fields = wb.getSheet("項目");
            assertEquals("項目", fields.getRow(0).getCell(0).getStringCellValue());
            assertEquals("値", fields.getRow(0).getCell(1).getStringCellValue());
            assertEquals("invoiceNo", fields.getRow(1).getCell(0).getStringCellValue());
            assertEquals("INV-1", fields.getRow(1).getCell(1).getStringCellValue());
            assertEquals("total", fields.getRow(2).getCell(0).getStringCellValue());
            assertEquals("154000", fields.getRow(2).getCell(1).getStringCellValue());

            Sheet items = wb.getSheet("items");
            assertEquals("code", items.getRow(0).getCell(0).getStringCellValue());
            assertEquals("qty", items.getRow(0).getCell(1).getStringCellValue());
            assertEquals("A", items.getRow(1).getCell(0).getStringCellValue());
            assertEquals("2", items.getRow(1).getCell(1).getStringCellValue());
            assertEquals("B", items.getRow(2).getCell(0).getStringCellValue());
        }
    }

    @Test
    void buildWorkbook_unionsKeysAcrossRows() throws Exception {
        JsonNode tpl = templateWithBand("rows");
        JsonNode data = json("{ \"rows\": [ { \"a\": 1 }, { \"a\": 2, \"b\": 9 } ] }");
        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, data))) {
            Sheet s = wb.getSheet("rows");
            assertEquals("a", s.getRow(0).getCell(0).getStringCellValue());
            assertEquals("b", s.getRow(0).getCell(1).getStringCellValue());
            // Missing key in first row → empty cell
            Cell missing = s.getRow(1).getCell(1);
            assertTrue(missing == null || missing.getStringCellValue().isEmpty());
        }
    }

    @Test
    void buildWorkbook_cellsAreStringTypeToPreventFormulaExecution() throws Exception {
        JsonNode tpl = templateWithBand("items");
        JsonNode data = json("{ \"items\": [ { \"formula\": \"=SUM(A1:A9)\" } ] }");
        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, data))) {
            Cell cell = wb.getSheet("items").getRow(1).getCell(0);
            assertEquals(CellType.STRING, cell.getCellType());
            assertEquals("=SUM(A1:A9)", cell.getStringCellValue());
        }
    }

    @Test
    void buildWorkbook_prefersDataSourceOrderThenOtherArrays() throws Exception {
        JsonNode tpl = templateWithBand("items");
        JsonNode data = json("""
            { "other": [ { "x": 1 } ], "items": [ { "code": "A" } ] }
            """);
        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, data))) {
            // items (dataSource-referenced) must come before other
            assertEquals(List.of("items", "other"), sheetNames(wb));
        }
    }

    @Test
    void buildWorkbook_emptyDataProducesPlaceholderSheet() throws Exception {
        JsonNode tpl = templateWithBand("items");
        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, json("{}")))) {
            assertEquals(1, wb.getNumberOfSheets());
            assertEquals("データ", wb.getSheetName(0));
        }
    }

    @Test
    void buildWorkbook_serializesNestedValuesAsJson() throws Exception {
        JsonNode tpl = templateWithBand("items");
        JsonNode data = json("{ \"items\": [ { \"meta\": { \"k\": 1 } } ] }");
        try (XSSFWorkbook wb = read(StatelessExcelController.buildWorkbook(tpl, data))) {
            assertEquals("{\"k\":1}", wb.getSheet("items").getRow(1).getCell(0).getStringCellValue());
        }
    }
}
