import { renderHook, act } from "@testing-library/react";
import { test, expect, vi, beforeEach, describe } from "vitest";
import { useAuth } from "@/hooks/use-auth";

const {
  mockPush,
  mockSignIn,
  mockSignUp,
  mockGetAnonWorkData,
  mockClearAnonWork,
  mockGetProjects,
  mockCreateProject,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockGetAnonWorkData: vi.fn(),
  mockClearAnonWork: vi.fn(),
  mockGetProjects: vi.fn(),
  mockCreateProject: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: mockSignIn,
  signUp: mockSignUp,
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: mockGetAnonWorkData,
  clearAnonWork: mockClearAnonWork,
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: mockGetProjects,
}));

vi.mock("@/actions/create-project", () => ({
  createProject: mockCreateProject,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
});

describe("initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(typeof result.current.isLoading).toBe("boolean");
  });
});

describe("signIn", () => {
  test("calls the signIn action with provided credentials", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "password123");
  });

  test("returns the result from the signIn action", async () => {
    const authResult = { success: false, error: "Invalid credentials" };
    mockSignIn.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signIn("user@example.com", "bad-password");
    });

    expect(returned).toEqual(authResult);
  });

  test("sets isLoading to true while running", async () => {
    let resolveSignIn!: (val: unknown) => void;
    mockSignIn.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      })
    );

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signIn("user@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn({ success: false });
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false after completion", async () => {
    mockSignIn.mockResolvedValue({ success: false });
    mockGetProjects.mockResolvedValue([]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even if signIn action throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signIn("user@example.com", "wrong-password");
    });

    expect(mockGetAnonWorkData).not.toHaveBeenCalled();
    expect(mockGetProjects).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe("post sign-in navigation with anon work", () => {
    test("creates a project from anon work and redirects when messages exist", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      const anonWork = {
        messages: [{ role: "user", content: "Make a button" }],
        fileSystemData: { "/": {}, "/App.jsx": { content: "..." } },
      };
      mockGetAnonWorkData.mockReturnValue(anonWork);
      mockCreateProject.mockResolvedValue({ id: "anon-project-1" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonWork.messages,
          data: anonWork.fileSystemData,
        })
      );
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-project-1");
      expect(mockGetProjects).not.toHaveBeenCalled();
    });

    test("project name includes a time string when created from anon work", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "Hello" }],
        fileSystemData: {},
      });
      mockCreateProject.mockResolvedValue({ id: "p1" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      const [input] = mockCreateProject.mock.calls[0];
      expect(input.name).toMatch(/^Design from /);
    });

    test("skips anon project creation when anon work has no messages", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockGetProjects.mockResolvedValue([{ id: "existing-1" }]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-1");
    });

    test("skips anon project creation when getAnonWorkData returns null", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "existing-1" }]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-1");
    });
  });

  describe("post sign-in navigation without anon work", () => {
    test("redirects to the most recent project when projects exist", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([
        { id: "recent-project" },
        { id: "older-project" },
      ]);

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockPush).toHaveBeenCalledWith("/recent-project");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    test("creates a new project and redirects when no projects exist", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "brand-new-project" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      expect(mockCreateProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
    });

    test("new project name includes a random number", async () => {
      mockSignIn.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "p1" });

      const { result } = renderHook(() => useAuth());
      await act(async () => {
        await result.current.signIn("user@example.com", "password123");
      });

      const [input] = mockCreateProject.mock.calls[0];
      expect(input.name).toMatch(/^New Design #\d+$/);
    });
  });
});

describe("signUp", () => {
  test("calls the signUp action with provided credentials", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
  });

  test("returns the result from the signUp action", async () => {
    const authResult = { success: false, error: "Email already registered" };
    mockSignUp.mockResolvedValue(authResult);

    const { result } = renderHook(() => useAuth());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.signUp("new@example.com", "password123");
    });

    expect(returned).toEqual(authResult);
  });

  test("sets isLoading to true while running", async () => {
    let resolveSignUp!: (val: unknown) => void;
    mockSignUp.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      })
    );

    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.signUp("new@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignUp({ success: false });
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false after completion", async () => {
    mockSignUp.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even if signUp action throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123").catch(() => {});
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not navigate when signUp fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("existing@example.com", "password123");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  test("redirects to most recent project on successful signUp when projects exist", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "existing-project" }]);

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockPush).toHaveBeenCalledWith("/existing-project");
  });

  test("creates a new project and redirects on successful signUp when no projects exist", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "first-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/first-project");
  });

  test("handles anon work on successful signUp", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "Make a form" }],
      fileSystemData: { "/": {} },
    });
    mockCreateProject.mockResolvedValue({ id: "anon-project" });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.signUp("new@example.com", "password123");
    });

    expect(mockCreateProject).toHaveBeenCalled();
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-project");
  });
});
