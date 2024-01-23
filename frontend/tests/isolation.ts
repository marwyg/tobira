// This file defines "fixtures" that provide a perfectly isolated testing
// environment. For each worker process, one Tobira instance is started with
// its own database. The database is cleared after every test.

import * as fs from "fs/promises";
import * as childProcess from "child_process";
import { test as base } from "@playwright/test";
import postgres from "postgres";
import waitPort from "wait-port";


export type CustomWorkerFixtures = {
    tobiraBinary: string;
    tobiraProcess: TobiraProcess;
};

export type CustomTestFixtures = {
    tobiraReset: TobiraReset;
    activeSearchIndex: ActiveSearchIndex;
};

export type TobiraProcess = {
    port: number;
    workerDir: string;
    configPath: string;
    binaryPath: string;
    dbName: string;
    index: number;
};

export type TobiraReset = {
    /**
     * This is for speeding up tests: tests that do not write anything to the DB
     * can call this to prevent the reset step after they are finished.
     */
    resetNotNecessaryIDoNotModifyAnything: () => void;
};

export type ActiveSearchIndex = Record<string, never>;

export const test = base.extend<CustomTestFixtures, CustomWorkerFixtures>({
    tobiraBinary: ["backend/target/debug/tobira", { option: true, scope: "worker" }],

    // This fixture starts a new completely isolated Tobira process (with its
    // own DB) for each Playwright worker process.
    tobiraProcess: [async ({ tobiraBinary }, use, workerInfo) => {
        // Create temporary folder
        const index = workerInfo.parallelIndex;
        const outDir = `${workerInfo.config.rootDir}/../test-results/`;
        const workerDir = `${outDir}/_tobira/process${index}`;
        const rootPath = `${workerInfo.config.rootDir}/../../`;
        const configPath = `${workerDir}/config.toml`;
        await fs.mkdir(workerDir, { recursive: true });

        // Write config file for this test runner
        const port = 3100 + index;
        const dbName = `tobira_ui_test_${index}`;
        const config = tobiraConfig({ port, dbName, index, rootPath });
        await fs.writeFile(configPath, config, { encoding: "utf8" });

        // Create temporary database for this Tobira process
        const sql = postgres("postgres://tobira:tobira@127.0.0.1/tobira", {
            onnotice: () => {},
        });
        await sql.unsafe(`drop database if exists ${dbName}`);
        await sql.unsafe(`create database ${dbName}`);

        // Start Tobira
        const binaryPath = `${rootPath}/${tobiraBinary}`;
        const tobiraProcess = childProcess.spawn(
            binaryPath,
            ["serve", "--config", configPath],
            // { stdio: "inherit" }
        );
        await waitPort({ port, interval: 10, output: "silent" });


        // Use fixture
        await use({ port, workerDir, configPath, binaryPath, dbName, index });


        // Cleanup
        tobiraProcess.kill();
        await sql.unsafe(`drop database if exists ${dbName}`);
        await fs.rm(workerDir, { recursive: true });
    }, { scope: "worker", auto: true }],

    // We set the base URL for all tests here, which depends on the port.
    baseURL: async ({ tobiraProcess }, use) => {
        await use(`http://localhost:${tobiraProcess.port}`);
    },

    // This resets the Tobira DB after every test that modifies any data.
    tobiraReset: [async ({ tobiraProcess }, use) => {
        let shouldReset = true;
        await use({
            resetNotNecessaryIDoNotModifyAnything: () => { shouldReset = false; },
        });
        if (shouldReset) {
            await runTobiraCommand(tobiraProcess, ["db", "reset", "--yes-absolutely-clear-db"]);
        }
    }, { auto: true }],

    activeSearchIndex: async ({ tobiraProcess }, use) => {
        await runTobiraCommand(tobiraProcess, ["search-index", "update"]);
        await use({});
        await runTobiraCommand(tobiraProcess,
            ["search-index", "clear", "--yes-absolutely-clear-index"]);
    },
});

const runTobiraCommand = async (tobira: TobiraProcess, args: string[]) => {
    // eslint-disable-next-line no-console
    console.debug(`Running: tobira${tobira.index} `, args);
    await new Promise(resolve => {
        args.push("-c");
        args.push(tobira.configPath);
        const p = childProcess.spawn(tobira.binaryPath, args);
        p.on("close", resolve);
    });
};

// TODO: DB
const tobiraConfig = ({ index, port, dbName, rootPath }: {
    index: number;
    port: number;
    dbName: string;
    rootPath: string;
}) => `
    [general]
    site_title.en = "Tobira Videoportal"
    tobira_url = "http://localhost:${port}"
    users_searchable = true

    [http]
    port = ${port}

    [db]
    database = "${dbName}"
    user = "tobira"
    password = "tobira"
    tls_mode = "off"

    [meili]
    index_prefix = "tobira_ui_test_${index}"
    key = "tobira"

    [log]
    level = "debug"

    [auth]
    mode = "login-proxy"
    trusted_external_key = "tobira"
    pre_auth_external_links = true

    [auth.jwt]
    signing_algorithm = "ES256"

    [opencast]
    host = "https://dummy.invalid" # Not used in UI tests

    [sync]
    user = "admin"
    password = "opencast"

    [theme]
    logo.large.path = "${rootPath}/util/dev-config/logo-large.svg"
    logo.large.resolution = [425, 182]
    logo.large_dark.path = "${rootPath}/util/dev-config/logo-large-dark.svg"
    logo.large_dark.resolution = [425, 182]
    logo.small.path = "${rootPath}/util/dev-config/logo-small.svg"
    logo.small.resolution = [212, 182]
    logo.small_dark.path = "${rootPath}/util/dev-config/logo-small.svg"
    logo.small_dark.resolution = [212, 182]
    favicon = "${rootPath}/util/dev-config/favicon.svg"
`;
