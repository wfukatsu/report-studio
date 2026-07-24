package com.report.server;

import com.report.server.auth.AdminUserController;
import com.report.server.auth.AuthController;
import com.report.server.auth.FormSessionManager;
import com.report.server.auth.RateLimiter;
import com.report.server.auth.UserRepository;
import com.report.server.job.BatchPdfOrchestrator;
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
     * Single access point for direct ScalarDB usage (#421): owns the app-wide transaction manager,
     * hands out short-lived admin instances, and hosts the shared TableMetadata cache. Controllers
     * that talk to ScalarDB directly receive this instead of the raw {@link TransactionFactory}.
     */
    private final ScalarDbGateway gateway;

    /**
     * The single app-wide {@link DistributedTransactionManager} (owned by {@link #gateway}).
     * ScalarDB managers are thread-safe and meant to be created once and reused; {@code
     * factory.getTransactionManager()} builds a fresh manager (with its own connection pool) on
     * every call and never closes it, so repositories and controllers must share this one instance
     * rather than call the factory per operation (issue #203). Closed in {@link #shutdown()}.
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
    final BatchPdfOrchestrator batchPdfOrchestrator;
    final BatchPdfController batchPdfCtrl;
    final JsonBlobRepository sequenceRepo;
    final SequenceController sequenceCtrl;
    final DocumentNumberService documentNumberService;
    final StatusAuditRepository statusAuditRepo;
    final JsonBlobRepository webhookRepo;
    final WebhookDispatcher webhookDispatcher;
    final WebhookController webhookCtrl;
    final WebhookDispatchService webhookDispatchService;
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
        // Single shared gateway + transaction manager — created once, reused by every
        // repository and controller, closed on shutdown (issues #203, #421).
        gateway = new ScalarDbGateway(factory);
        txManager = gateway.transactionManager();

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
        versionCtrl = new VersionController(gateway, v2DefinitionsRepo);
        versionCtrl.ensureTable();
        // Document numbering, status audit, and webhook dispatch are created before the
        // form-response controller so the submit flow receives them via constructor
        // injection (#419 — the old lazy setter wiring is gone).
        sequenceRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "sequences");
        sequenceRepo.ensureTable();
        sequenceCtrl = new SequenceController(sequenceRepo, v2DefinitionsRepo);
        documentNumberService = new DocumentNumberService(sequenceRepo);
        // Status-transition audit trail (#188)
        statusAuditRepo =
                new StatusAuditRepository(
                        new JsonBlobRepository(factory, txManager, NAMESPACE, "status_audit"));
        statusAuditRepo.ensureTable();
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
        SecretCrypto webhookCrypto = SecretCrypto.fromEnv();
        webhookCtrl =
                new WebhookController(
                        webhookRepo, v2DefinitionsRepo, webhookDispatcher, webhookCrypto);
        webhookDispatchService =
                new WebhookDispatchService(
                        webhookRepo, webhookDispatcher, webhookCrypto, webhookExecutor);
        formResponseCtrl =
                new FormResponseController(
                        v2ResponseRepo,
                        v2DefinitionsRepo,
                        v2SubmitLimiter,
                        documentNumberService,
                        webhookDispatchService,
                        statusAuditRepo);
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
        scalarDbCatalogCtrl = new ScalarDbCatalogController(gateway);
        scalarDbTableCtrl = new ScalarDbTableController(gateway);
        // Product catalog is created before the controllers that read it, so both
        // ProductController and BindingResolveController receive it via constructor
        // injection (#418 — the old controller-to-controller setter wiring is gone).
        productRepo = new JsonBlobRepository(factory, txManager, NAMESPACE, "products");
        productRepo.ensureTable();
        productCatalog = new ProductCatalogService(productRepo);
        bindingResolveCtrl =
                new BindingResolveController(gateway, v2DefinitionsRepo, productCatalog);
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
        scalarDbScanCtrl = new ScalarDbScanController(gateway);
        scalarDbRowCtrl = new ScalarDbRowController(gateway);
        batchPdfOrchestrator = new BatchPdfOrchestrator(v2ResponseRepo, jobRepo, pdfExecutor);
        batchPdfCtrl = new BatchPdfController(v2DefinitionsRepo, jobRepo, batchPdfOrchestrator);
        jobCtrl = new JobController(jobRepo, new BatchPdfProcessor(projRepo, jobRepo), jobExecutor);
        healthCtrl =
                new HealthController(gateway, jobRepo, JobRepository.jobsRoot(), Metrics.GLOBAL);
    }

    /** Gracefully shuts down all executor pools (call from Javalin serverStopping event). */
    public void shutdown() {
        log.info("Shutting down executor pools...");
        authCtrl.shutdown();
        formSessionManager.shutdown();
        jobTtlReaper.close();
        batchPdfOrchestrator.shutdown();
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
