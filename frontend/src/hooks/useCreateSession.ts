import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Mode } from "../api/types";

export function useCreateSession() {
  return useMutation({
    mutationFn: ({ patientName, mode }: { patientName: string; mode: Mode }) =>
      api.createSession(patientName, mode),
  });
}
