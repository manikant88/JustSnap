import { deleteImageBlob, getImageBlob, saveImageBlob } from "../shared/blobStore";
import type { Capture } from "../shared/types";
import { insertCapture } from "./libraryRepository";

type ImageStoreDependencies = {
  saveBlob: (key: string, blob: Blob) => Promise<void>;
  deleteBlob: (key: string) => Promise<void>;
  insertMetadata: (capture: Capture, topLevel: boolean) => Promise<unknown>;
};

export function createImageStore(dependencies: ImageStoreDependencies) {
  return {
    async putCapture(capture: Capture, blob: Blob, topLevel = true): Promise<void> {
      await dependencies.saveBlob(capture.imageBlobKey, blob);
      try {
        await dependencies.insertMetadata(capture, topLevel);
      } catch (error) {
        // Metadata is the source of truth. Compensate immediately so a failed
        // metadata write cannot leave an unreachable image blob behind.
        await dependencies.deleteBlob(capture.imageBlobKey).catch(() => undefined);
        throw error;
      }
    }
  };
}

export const imageStore = {
  ...createImageStore({
    saveBlob: saveImageBlob,
    deleteBlob: deleteImageBlob,
    insertMetadata: insertCapture
  }),
  loadBlob: getImageBlob
};
