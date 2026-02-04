import { getEnv } from "../env";
import { FeatureDisabledError } from "./errors";

export const ensureDriveIndexingEnabled = () => {
  const env = getEnv();
  if (!env.FEATURE_DRIVE_INDEXING_ENABLED) {
    throw new FeatureDisabledError("drive_indexing");
  }
};

export const ensureEmbeddingsEnabled = () => {
  const env = getEnv();
  if (!env.FEATURE_EMBEDDINGS_ENABLED) {
    throw new FeatureDisabledError("embeddings");
  }
};

export const ensureChatEnabled = () => {
  const env = getEnv();
  if (!env.FEATURE_CHAT_ENABLED) {
    throw new FeatureDisabledError("chat");
  }
};
