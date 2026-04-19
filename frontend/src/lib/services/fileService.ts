import { api } from "@/lib/api";

interface UploadResponse {
  attachmentId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export const fileService = {
  upload: (file: File, roomId: number): Promise<UploadResponse> => {
    const form = new FormData();
    form.append("file", file);
    form.append("roomId", String(roomId));
    form.append("originalFilename", file.name);
    return api.upload<UploadResponse>("/api/files/upload", form);
  },
};
