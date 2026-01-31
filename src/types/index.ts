import { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
  }
}

export interface TestMetrics {
  freeze?: {
    detected: boolean;
    count: number;
    totalDuration: number;
    timestamps: number[];
  };
  mosaic?: {
    detected: boolean;
    severity: string;
    frames: number[];
  };
  blackFrame?: {
    detected: boolean;
    count: number;
    totalDuration: number;
  };
  avSync?: {
    offset_ms: number;
    status: string;
  };
  lossFrame?: {
    count: number;
    percentage: number;
  };
  latency?: number;
  jitter?: number;
  bitrate?: {
    average: number;
    min: number;
    max: number;
    unit: string;
  };
  bufferHealth?: {
    avgLevel: number;
    stallCount: number;
    stallDuration: number;
  };
}
