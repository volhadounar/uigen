import { test, expect, vi, beforeEach } from "vitest";
import { createSession, getSession } from "@/lib/auth";

const { mockSet, mockSign, mockJwtVerify, mockGet } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockSign: vi.fn().mockResolvedValue("mock.jwt.token"),
  mockJwtVerify: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: mockSign,
  })),
  jwtVerify: mockJwtVerify,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockSet,
    get: mockGet,
    delete: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("createSession sets auth-token cookie", async () => {
  await createSession("user-123", "test@example.com");

  expect(mockSet).toHaveBeenCalledOnce();
  const [name] = mockSet.mock.calls[0];
  expect(name).toBe("auth-token");
});

test("createSession sets a valid JWT token", async () => {
  await createSession("user-123", "test@example.com");

  const [, token] = mockSet.mock.calls[0];
  expect(typeof token).toBe("string");
  expect(token.split(".")).toHaveLength(3);
});

test("createSession sets httpOnly cookie with correct options", async () => {
  await createSession("user-123", "test@example.com");

  const [, , options] = mockSet.mock.calls[0];
  expect(options.httpOnly).toBe(true);
  expect(options.path).toBe("/");
  expect(options.sameSite).toBe("lax");
  expect(options.expires).toBeInstanceOf(Date);
});

test("createSession cookie expires in ~7 days", async () => {
  const before = Date.now();
  await createSession("user-123", "test@example.com");
  const after = Date.now();

  const [, , options] = mockSet.mock.calls[0];
  const expiresMs = options.expires.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  expect(expiresMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
  expect(expiresMs).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
});

const mockPayload = {
  userId: "user-123",
  email: "test@example.com",
  expiresAt: new Date(),
};

test("getSession returns null when no cookie is present", async () => {
  mockGet.mockReturnValue(undefined);

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns session payload for a valid token", async () => {
  mockGet.mockReturnValue({ value: "valid.jwt.token" });
  mockJwtVerify.mockResolvedValue({ payload: mockPayload });

  const session = await getSession();

  expect(session).toEqual(mockPayload);
});

test("getSession returns null when token verification fails", async () => {
  mockGet.mockReturnValue({ value: "invalid.jwt.token" });
  mockJwtVerify.mockRejectedValue(new Error("invalid signature"));

  const session = await getSession();

  expect(session).toBeNull();
});
