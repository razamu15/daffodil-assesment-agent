/**
 * InMemoryStore against the shared Store conformance suite. DynamoStore runs the
 * same suite at gate I2.
 */
import { InMemoryStore } from "../src/index";
import { runStoreConformance } from "./storeConformance";

runStoreConformance("InMemoryStore", () => new InMemoryStore());
