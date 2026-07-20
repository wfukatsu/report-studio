package com.report.server;

import com.scalar.db.api.DistributedTransaction;
import com.scalar.db.api.DistributedTransactionAdmin;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.api.Put;
import com.scalar.db.api.TableMetadata;
import com.scalar.db.exception.storage.ExecutionException;
import com.scalar.db.exception.transaction.TransactionException;
import com.scalar.db.io.DataType;
import com.scalar.db.io.Key;
import com.scalar.db.service.TransactionFactory;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Seeds the ScalarDB database with sample tables and data for the built-in business document
 * templates (御見積書, 御注文書, 御請求書).
 *
 * <p>Usage: {@code ./gradlew seed}
 *
 * <p>Tables are created in the {@code sample} namespace. If a table already exists, creation is
 * skipped (idempotent). Rows are upserted so re-running the seed is safe.
 */
public final class SeedData {

    private static final Logger log = LoggerFactory.getLogger(SeedData.class);
    private static final String NS = "sample";

    private SeedData() {}

    public static void main(String[] args) throws Exception {
        AppConfig.ensureDataDir();
        TransactionFactory factory = AppConfig.createTransactionFactory();
        DistributedTransactionAdmin admin = factory.getTransactionAdmin();
        DistributedTransactionManager txMgr = factory.getTransactionManager();

        try {
            ensureNamespace(admin);
            createTables(admin);
            insertSampleData(txMgr);
            log.info("Seed completed successfully");
        } finally {
            admin.close();
            txMgr.close();
        }
    }

    // ── Schema creation ──────────────────────────────────────────────────────

    private static void ensureNamespace(DistributedTransactionAdmin admin)
            throws ExecutionException {
        if (!admin.namespaceExists(NS)) {
            admin.createNamespace(NS);
            log.info("Created namespace: {}", NS);
        }
    }

    private static void createTables(DistributedTransactionAdmin admin) throws ExecutionException {
        createTableIfAbsent(
                admin,
                "customers",
                orderedMap(
                        "id", DataType.TEXT,
                        "customer_name", DataType.TEXT,
                        "postal_code", DataType.TEXT,
                        "address", DataType.TEXT,
                        "contact_person", DataType.TEXT),
                "id");

        createTableIfAbsent(
                admin,
                "documents",
                orderedMap(
                        "id", DataType.TEXT,
                        "document_type", DataType.TEXT,
                        "document_no", DataType.TEXT,
                        "issue_date", DataType.TEXT,
                        "registration_no", DataType.TEXT,
                        "valid_until", DataType.TEXT,
                        "delivery_terms", DataType.TEXT,
                        "payment_terms", DataType.TEXT,
                        "notes", DataType.TEXT,
                        "customer_id", DataType.TEXT),
                "id");

        createTableIfAbsent(
                admin,
                "items",
                orderedMap(
                        "document_id", DataType.TEXT,
                        "line_no", DataType.INT,
                        "item_code", DataType.TEXT,
                        "item_name", DataType.TEXT,
                        "quantity", DataType.INT,
                        "unit", DataType.TEXT,
                        "unit_price", DataType.INT,
                        "amount", DataType.INT),
                "document_id",
                "line_no");

        createTableIfAbsent(
                admin,
                "summaries",
                orderedMap(
                        "document_id", DataType.TEXT,
                        "subtotal", DataType.INT,
                        "tax10_base", DataType.INT,
                        "tax10_amount", DataType.INT,
                        "tax8_base", DataType.INT,
                        "tax8_amount", DataType.INT,
                        "total_inc_tax", DataType.INT),
                "document_id");

        createTableIfAbsent(
                admin,
                "bank_accounts",
                orderedMap(
                        "document_id", DataType.TEXT,
                        "payment_due_date", DataType.TEXT,
                        "bank_name", DataType.TEXT,
                        "branch_name", DataType.TEXT,
                        "account_type", DataType.TEXT,
                        "account_number", DataType.TEXT,
                        "account_holder", DataType.TEXT),
                "document_id");

        createTableIfAbsent(
                admin,
                "deliveries",
                orderedMap(
                        "document_id", DataType.TEXT,
                        "delivery_date", DataType.TEXT,
                        "delivery_address", DataType.TEXT,
                        "delivery_contact", DataType.TEXT),
                "document_id");
    }

    private static void createTableIfAbsent(
            DistributedTransactionAdmin admin,
            String table,
            Map<String, DataType> columns,
            String... keys)
            throws ExecutionException {
        if (admin.tableExists(NS, table)) {
            log.info("Table already exists: {}.{}", NS, table);
            return;
        }

        TableMetadata.Builder builder = TableMetadata.newBuilder();
        for (var entry : columns.entrySet()) {
            builder.addColumn(entry.getKey(), entry.getValue());
        }
        builder.addPartitionKey(keys[0]);
        for (int i = 1; i < keys.length; i++) {
            builder.addClusteringKey(keys[i]);
        }

        admin.createTable(NS, table, builder.build());
        log.info("Created table: {}.{}", NS, table);
    }

    // ── Sample data insertion ────────────────────────────────────────────────

    private static void insertSampleData(DistributedTransactionManager txMgr)
            throws TransactionException {

        DistributedTransaction tx = txMgr.start();
        try {
            // ── Customer ─────────────────────────────────────────────────
            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("customers")
                            .partitionKey(Key.ofText("id", "C-001"))
                            .textValue("customer_name", "株式会社サンプル商事")
                            .textValue("postal_code", "100-0001")
                            .textValue("address", "東京都千代田区千代田1-1-1 サンプルビル3F")
                            .textValue("contact_person", "山田太郎")
                            .build());

            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("customers")
                            .partitionKey(Key.ofText("id", "C-002"))
                            .textValue("customer_name", "合同会社テスト工業")
                            .textValue("postal_code", "530-0001")
                            .textValue("address", "大阪府大阪市北区梅田2-2-2 テストタワー10F")
                            .textValue("contact_person", "鈴木一郎")
                            .build());

            // ── Quotation document ───────────────────────────────────────
            String qId = "QT-2026-0042";
            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("documents")
                            .partitionKey(Key.ofText("id", qId))
                            .textValue("document_type", "quotation")
                            .textValue("document_no", qId)
                            .textValue("issue_date", "2026年4月18日")
                            .textValue("registration_no", "T1234567890123")
                            .textValue("valid_until", "2026年5月18日")
                            .textValue("delivery_terms", "受注後2週間以内")
                            .textValue("payment_terms", "月末締め翌月末払い")
                            .textValue("notes", "本見積書の有効期限は発行日より30日間です。")
                            .textValue("customer_id", "C-001")
                            .build());

            putItems(tx, qId);
            putSummary(tx, qId);

            // ── Purchase order ───────────────────────────────────────────
            String poId = "PO-2026-0015";
            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("documents")
                            .partitionKey(Key.ofText("id", poId))
                            .textValue("document_type", "purchase_order")
                            .textValue("document_no", poId)
                            .textValue("issue_date", "2026年4月18日")
                            .textValue("registration_no", "T1234567890123")
                            .textValue("payment_terms", "月末締め翌月末払い")
                            .textValue("notes", "納品時に検品を行います。不良品は交換対応をお願いします。")
                            .textValue("customer_id", "C-001")
                            .build());

            putItems(tx, poId);
            putSummary(tx, poId);

            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("deliveries")
                            .partitionKey(Key.ofText("document_id", poId))
                            .textValue("delivery_date", "2026年5月10日")
                            .textValue("delivery_address", "東京都港区芝公園4-2-8 東京タワー倉庫")
                            .textValue("delivery_contact", "佐藤花子")
                            .build());

            // ── Invoice ──────────────────────────────────────────────────
            String invId = "INV-2026-0031";
            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("documents")
                            .partitionKey(Key.ofText("id", invId))
                            .textValue("document_type", "invoice")
                            .textValue("document_no", invId)
                            .textValue("issue_date", "2026年4月18日")
                            .textValue("registration_no", "T1234567890123")
                            .textValue("notes", "お振込手数料はお客様ご負担にてお願い申し上げます。")
                            .textValue("customer_id", "C-001")
                            .build());

            putItems(tx, invId);
            putSummary(tx, invId);

            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("bank_accounts")
                            .partitionKey(Key.ofText("document_id", invId))
                            .textValue("payment_due_date", "2026年5月31日")
                            .textValue("bank_name", "みずほ銀行")
                            .textValue("branch_name", "丸の内支店")
                            .textValue("account_type", "普通")
                            .textValue("account_number", "1234567")
                            .textValue("account_holder", "カ）サンプルショウジ")
                            .build());

            tx.commit();
            log.info("Inserted sample data for 3 documents + 2 customers");

        } catch (Exception e) {
            tx.abort();
            throw e;
        }
    }

    /** Shared 4-line-item set used by all 3 document types. */
    private static void putItems(DistributedTransaction tx, String docId)
            throws TransactionException {
        int[][] rows = {
            // quantity, unitPrice, amount
            {10, 5000, 50000},
            {5, 8000, 40000},
            {1, 30000, 30000},
            {1, 20000, 20000},
        };
        String[] codes = {"W-001", "W-002", "S-001", "M-001"};
        String[] names = {"ウィジェットA", "ウィジェットB", "設置作業費", "保守サポート（年間）"};
        String[] units = {"個", "個", "式", "式"};

        for (int i = 0; i < rows.length; i++) {
            tx.put(
                    Put.newBuilder()
                            .namespace(NS)
                            .table("items")
                            .partitionKey(Key.ofText("document_id", docId))
                            .clusteringKey(Key.ofInt("line_no", i + 1))
                            .textValue("item_code", codes[i])
                            .textValue("item_name", names[i])
                            .intValue("quantity", rows[i][0])
                            .textValue("unit", units[i])
                            .intValue("unit_price", rows[i][1])
                            .intValue("amount", rows[i][2])
                            .build());
        }
    }

    private static void putSummary(DistributedTransaction tx, String docId)
            throws TransactionException {
        tx.put(
                Put.newBuilder()
                        .namespace(NS)
                        .table("summaries")
                        .partitionKey(Key.ofText("document_id", docId))
                        .intValue("subtotal", 140000)
                        .intValue("tax10_base", 140000)
                        .intValue("tax10_amount", 14000)
                        .intValue("tax8_base", 0)
                        .intValue("tax8_amount", 0)
                        .intValue("total_inc_tax", 154000)
                        .build());
    }

    // ── Utility ──────────────────────────────────────────────────────────────

    private static Map<String, DataType> orderedMap(Object... pairs) {
        Map<String, DataType> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put((String) pairs[i], (DataType) pairs[i + 1]);
        }
        return map;
    }
}
