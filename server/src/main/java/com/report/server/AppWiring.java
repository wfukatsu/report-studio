package com.report.server;

import com.report.server.auth.AdminUserController;
import com.report.server.auth.AuthController;
import com.report.server.auth.FormSessionManager;
import com.report.server.auth.RateLimiter;
import com.report.server.auth.UserRepository;
import com.report.server.job.BatchPdfProcessor;
import com.report.server.job.JobController;
import com.report.server.job.JobRepository;
import com.scalar.db.api.DistributedTransactionManager;
import com.scalar.db.service.TransactionFactory;
import java.nio.file.Path;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Wires all repositories and controllers together. Owns the lifecycle of shared ExecutorService
 * instances.
 */
public final class AppWiring {

    private static final Logger log = LoggerFactory.getLogger(AppWiring.class);
    private static final String NAMESPACE = "report_studio";

    /**
     * The single app-wide {@link DistributedTransactionManager}. ScalarDB managers are thread-safe
     * and meant to be created once and reused; {@code factory.getTransactionManager()} builds a
     * fresh manager (with its own connection pool) on every call and never closes it, so
     * repositories and controllers must share this one instance rather than call the factory per
     * operation (issue #203). Closed in {@link #shutdown()}.
     */
    private final DistributedTransactionManager txManager;

    // ── Repositories ──────────────────────────────────────────────────────────
    final ProjectionRepository projRepo;
    final JsonBlobRepository schemaRepo;
    final JsonBlobRepository bindingTreeRepo;
    final JsonBlobRepository responseRepo;
    final TemplateListRepository templateList;
    final JobRepository jobRepo;
    final VersionRepository versionRepo;

    // ── V2 repositories and controllers ───────────────────────────────────────
    final JsonBlobRepository v2DefinitionsRepo;
    final JsonBlobRepository v2ResponseRepo;
    final TemplateController templateCtrl;
    final SchemaLibraryController schemaLibraryCtrl;
    final EvaluateController evalCtrl;
    final VersionController versionCtrl;
    final FormResponseController formResponseCtrl;
    final ResponseExportController responseExportCtrl;
    final ResponsePdfController responsePdfCtrl;
    final PdfController pdfCtrl;
    final TemplateExportController exportCtrl;
    final ThumbnailController thumbnailCtrl;
    final SchemaInferController schemaInferCtrl;
    final PdfJobController pdfJobCtrl;
    final StatelessPdfController statelessPdfCtrl;
    final StatelessExcelController statelessExcelCtrl;
    final ScalarDbCatalogController scalarDbCatalogCtrl;
    final ScalarDbTableController scalarDbTableCtrl;
    final BindingResolveController bindingResolveCtrl;
    final JsonBlobRepository tenantRepo;
    final TenantController tenantCtrl;

    // ── Product Master ─────────────────────────────────────────────────────────
    final JsonBlobRepository productRepo;
    final ProductCatalogService productCatalog;
    final ProductController productCtrl;
    final ScalarDbScanController scalarDbScanCtrl;
    final ScalarDbRowController scalarDbRowCtrl;
    final BatchPdfController batchPdfCtrl;
    final JsonBlobRepository sequenceRepo;
    final SequenceController sequenceCtrl;
    final StatusAuditRepository statusAuditRepo;
    final JsonBlobRepository webhookRepo;
    final WebhookDispatcher webhookDispatcher;
    final WebhookController webhookCtrl;
    final java.util.concurrent.ExecutorService webhookExecutor;

    // ── Admin controllers ─────────────────────────────────────────────────────
    final AdminUserController adminUserCtrl;
    final AdminServerController adminServerCtrl;

    // ── Controllers ───────────────────────────────────────────────────────────
    final AuthController authCtrl;
    final JsonBlobRepository apiTokenRepo;
    final ApiTokenController apiTokenCtrl;
    final GenericJsonController bindingCtrl;
    final PublicFormController publicFormCtrl;
    final JobController jobCtrl;
    final HealthController healthCtrl;

    // ── Executor pools ────────────────────────────────────────────────────────
    private final com.report.server.job.JobTtlReaper jobTtlReaper;
    private final ExecutorService jobExecutor;
    final ExecutorService pdfExecutor;
    private final FormSessionManager formSessionManager;

    // ── V2 rate limiters ──────────────────────────────────────────────────────
    /** 5 response submissions per user per 60 seconds. */
    final RateLimiter v2SubmitLimiter;

    /** 3 exports per user per 60 seconds. */
    final RateLimiter v2ExportLimiter;

    public AppWiring(TransactionFactory factory) {
        // Single shared transaction manager — created once, reused by every repository
        // and controller, closed on shutdown (issue #203).
        txManager = factory.getTransactionManager();

        // Repositories
        projRepo = new ProjectionRepository(factory, txManager);
        projRepo.ensureTable();

        schemaRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "schemas");
        schemaRepo.ensureTable();

        bindingTreeRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "binding_trees");
        bindingTreeRepo.ensureTable();

        templateList = new TemplateListRepository();

        UserRepository userRepo = new UserRepository(factory, txManager);
        userRepo.ensureTable();
        userRepo.ensureDefaultUser();

        jobRepo = new JobRepository(factory, txManager);
        jobRepo.ensureTable();
        jobRepo.reconcileOrphans();
        // Unified TTL reclamation for all job types (issue #60)
        jobTtlReaper = new com.report.server.job.JobTtlReaper(jobRepo, 60);

        responseRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "form_responses");
        responseRepo.ensureTable();

        versionRepo = new VersionRepository(factory, txManager);
        versionRepo.ensureTable();

        v2DefinitionsRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "v2_definitions");
        v2DefinitionsRepo.ensureTable();

        v2ResponseRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "v2_form_responses");
        v2ResponseRepo.ensureTable();

        // Executor pools
        jobExecutor =
                Executors.newFixedThreadPool(
                        Math.max(2, Runtime.getRuntime().availableProcessors() / 2));
        pdfExecutor = Executors.newFixedThreadPool(4);

        // V2 rate limiters
        v2SubmitLimiter = new RateLimiter(5, 60_000L);
        v2ExportLimiter = new RateLimiter(3, 60_000L);

        // Admin controllers
        adminUserCtrl = new AdminUserController(userRepo);
        adminServerCtrl = new AdminServerController(Path.of("scalardb.properties"));

        // Controllers
        authCtrl = new AuthController(userRepo);
        // API token (PAT) authentication (#195)
        apiTokenRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "api_tokens");
        apiTokenRepo.ensureTable();
        apiTokenCtrl = new ApiTokenController(authCtrl, userRepo, apiTokenRepo);
        bindingCtrl = new GenericJsonController(bindingTreeRepo, "binding-tree", "{}");
        formSessionManager = new FormSessionManager();
        publicFormCtrl =
                new PublicFormController(
                        templateList,
                        projRepo,
                        responseRepo,
                        formSessionManager,
                        new RateLimiter());
        templateCtrl = new TemplateController(v2DefinitionsRepo);

        // Schema Library
        final JsonBlobRepository schemaLibraryRepo =
                new JsonBlobRepository(factory, txManager, NAMESPACE, "schema_library");
        schemaLibraryRepo.ensureTable();
        schemaLibraryCtrl = new SchemaLibraryController(schemaLibraryRepo);
        evalCtrl = new EvaluateController();
        versionCtrl = new VersionController(factory, txManager, v2DefinitionsRepo);
        versionCtrl.ensureTable();
        formResponseCtrl =
                new FormResponseController(v2ResponseRepo, v2DefinitionsRepo, v2SubmitLimiter);
        responseExportCtrl =
                new ResponseExportController(v2ResponseRepo, v2DefinitionsRepo, v2ExportLimiter);
        responsePdfCtrl = new ResponsePdfController(v2ResponseRepo, v2DefinitionsRepo, pdfExecutor);
        pdfCtrl = new PdfController(v2DefinitionsRepo, pdfExecutor);
        exportCtrl = new TemplateExportController(v2DefinitionsRepo, new RateLimiter(10, 60_000L));
        thumbnailCtrl = new ThumbnailController(v2DefinitionsRepo, pdfExecutor);
        schemaInferCtrl = new SchemaInferController();
        pdfJobCtrl = new PdfJobController(v2DefinitionsRepo, jobRepo, pdfExecutor);
        statelessPdfCtrl = new StatelessPdfController(pdfExecutor);
        statelessExcelCtrl = new StatelessExcelController();
        scalarDbCatalogCtrl = new ScalarDbCatalogController(factory);
        scalarDbTableCtrl = new ScalarDbTableController(factory);
        // Product catalog is created before the controllers that read it, so both
        // ProductController and BindingResolveController receive it via constructor
        // injection (#418 — the old controller-to-controller setter wiring is gone).
        productRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "products");
        productRepo.ensureTable();
        productCatalog = new ProductCatalogService(productRepo);
        bindingResolveCtrl =
                new BindingResolveController(factory, txManager, v2DefinitionsRepo, productCatalog);
        tenantRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "tenant");
        tenantRepo.ensureTable();
        tenantCtrl = new TenantController(tenantRepo);
        // Tenant elements in PDFs resolve through this process-wide supplier (issue #54)
        TenantInfoProvider.setSupplier(
                () -> {
                    try {
                        var stored = tenantRepo.get("singleton");
                        return stored.isPresent()
                                ? new com.fasterxml.jackson.databind.ObjectMapper()
                                        .readTree(stored.get())
                                : null;
                    } catch (Exception e) {
                        return null;
                    }
                });
        productCtrl = new ProductController(productRepo, productCatalog);
        scalarDbScanCtrl = new ScalarDbScanController(factory, txManager);
        scalarDbRowCtrl = new ScalarDbRowController(factory, txManager);
        batchPdfCtrl =
                new BatchPdfController(v2DefinitionsRepo, v2ResponseRepo, jobRepo, pdfExecutor);
        sequenceRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "sequences");
        sequenceRepo.ensureTable();
        sequenceCtrl = new SequenceController(sequenceRepo, v2DefinitionsRepo);
        formResponseCtrl.setSequenceController(sequenceCtrl);
        // Status-transition audit trail (#188)
        statusAuditRepo =
                new StatusAuditRepository(
                        new JsonBlobRepository(factory, txManager, NAMESPACE, "status_audit"));
        statusAuditRepo.ensureTable();
        formResponseCtrl.setStatusAuditRepository(statusAuditRepo);
        webhookRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "webhooks");
        webhookRepo.ensureTable();
        webhookDispatcher = new WebhookDispatcher();
        webhookExecutor =
                new java.util.concurrent.ThreadPoolExecutor(
                        2,
                        8,
                        60L,
                        java.util.concurrent.TimeUnit.SECONDS,
                        new java.util.concurrent.LinkedBlockingQueue<>(100),
                        new java.util.concurrent.ThreadPoolExecutor.CallerRunsPolicy());
        webhookCtrl =
                new WebhookController(
                        webhookRepo, v2DefinitionsRepo, webhookDispatcher, SecretCrypto.fromEnv());
        formResponseCtrl.setWebhookController(webhookCtrl, webhookExecutor);
        jobCtrl = new JobController(jobRepo, new BatchPdfProcessor(projRepo, jobRepo), jobExecutor);
        healthCtrl =
                new HealthController(factory, jobRepo, JobRepository.jobsRoot(), Metrics.GLOBAL);
    }

    /** Gracefully shuts down all executor pools (call from Javalin serverStopping event). */
    public void shutdown() {
        log.info("Shutting down executor pools...");
        authCtrl.shutdown();
        formSessionManager.shutdown();
        jobTtlReaper.close();
        batchPdfCtrl.shutdown();
        jobExecutor.shutdown();
        pdfExecutor.shutdown();
        webhookExecutor.shutdown();
        try {
            if (!jobExecutor.awaitTermination(10, TimeUnit.SECONDS)) jobExecutor.shutdownNow();
            if (!pdfExecutor.awaitTermination(10, TimeUnit.SECONDS)) pdfExecutor.shutdownNow();
            if (!webhookExecutor.awaitTermination(10, TimeUnit.SECONDS))
                webhookExecutor.shutdownNow();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            jobExecutor.shutdownNow();
            pdfExecutor.shutdownNow();
            webhookExecutor.shutdownNow();
        }
        // Close the single shared transaction manager and its connection pool (issue #203).
        try {
            txManager.close();
        } catch (Exception e) {
            log.warn("Failed to close transaction manager: {}", e.getMessage());
        }
    }
}
