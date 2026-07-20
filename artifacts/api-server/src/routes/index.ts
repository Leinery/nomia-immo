import { Router, type IRouter } from "express";
import healthRouter from "./health";
import propertiesRouter from "./properties";
import unitsRouter from "./units";
import tenantsRouter from "./tenants";
import contractsRouter from "./contracts";
import documentsRouter from "./documents";
import utilityCostsRouter from "./utility-costs";
import utilityStatementsRouter from "./utility-statements";
import dashboardRouter from "./dashboard";
import bankingRouter from "./banking";

const router: IRouter = Router();

router.use(healthRouter);
router.use(propertiesRouter);
router.use(unitsRouter);
router.use(tenantsRouter);
router.use(contractsRouter);
router.use(documentsRouter);
router.use(utilityCostsRouter);
router.use(utilityStatementsRouter);
router.use(dashboardRouter);
router.use(bankingRouter);

export default router;
