import moduleManifestJson from "../../data/module-manifest.json";
import { ModuleManifest } from "./types";

export const moduleManifest = moduleManifestJson as unknown as ModuleManifest;
