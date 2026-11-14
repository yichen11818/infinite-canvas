import { expect, test } from "bun:test";
import { buildXiaokVideoBody, type VideoReference } from "../src/services/api/xiaok-video-request";

const config = { model: "actual-model-id", videoSeconds: "5", vquality: "720", size: "16:9", videoGenerateAudio: "true", videoWatermark: "false" };
const request = (patch = {}, references: VideoReference[] = []) => buildXiaokVideoBody({ config: { ...config, ...patch }, prompt: "海面日出", references });

test("text-only requests use JSON with integer seconds, resolution, ratio and booleans", () => {
    expect(JSON.parse(request() as string)).toEqual({ model: "actual-model-id", prompt: "海面日出", seconds: 5, resolution: "720p", aspect_ratio: "16:9", generate_audio: true, watermark: false });
});

test("4k, 768p and durations outside the legacy slider are not downgraded or clamped", () => {
    expect(JSON.parse(request({ vquality: "4k", videoSeconds: "45" }) as string)).toMatchObject({ resolution: "4k", seconds: 45 });
    expect(JSON.parse(request({ vquality: "768" }) as string).resolution).toBe("768p");
    expect(JSON.parse(request({ videoSeconds: "1" }) as string).seconds).toBe(1);
    expect(() => request({ videoSeconds: "5.5" })).toThrow("正整数");
});

test("auto settings omit optional parameters and explicit pixel sizes preserve their ratio", () => {
    const body = JSON.parse(request({ vquality: "auto", size: "auto", videoSeconds: "", videoGenerateAudio: "", videoWatermark: "" }) as string);
    expect(Object.keys(body)).toEqual(["model", "prompt"]);
    expect(JSON.parse(request({ size: "1920x1080" }) as string).aspect_ratio).toBe("16:9");
    expect(() => request({ vquality: "high" })).toThrow("实际分辨率");
    expect(() => request({ videoGenerateAudio: "yes" })).toThrow("true 或 false");
});

test("remote mixed references stay JSON with their explicit roles", () => {
    const references: VideoReference[] = [
        { type: "image", role: "first_frame", source: "https://media.example/first.png" },
        { type: "video", role: "reference", source: "https://media.example/motion.mp4" },
        { type: "audio", role: "reference", source: "https://media.example/music.mp3" },
    ];
    expect(JSON.parse(request({}, references) as string).references).toEqual(references);
});

test("local mixed uploads use one field family without image/video/audio aliases", () => {
    const references: VideoReference[] = [
        { type: "image", role: "reference", source: new File(["image"], "image.png", { type: "image/png" }) },
        { type: "video", role: "reference", source: new File(["video"], "motion.mp4", { type: "video/mp4" }) },
        { type: "audio", role: "reference", source: new File(["audio"], "music.mp3", { type: "audio/mpeg" }) },
    ];
    const body = request({}, references) as FormData;
    expect(body.getAll("input_reference[]")).toHaveLength(3);
    expect(body.get("size")).toBe("16:9");
    expect(body.get("resolution_name")).toBe("720p");
    for (const alias of ["images", "image[]", "video[]", "audio[]", "references", "ratio", "resolution"]) expect(body.has(alias)).toBe(false);
});

test("first and last frames upload exactly once; remote references are not duplicated", () => {
    const file = new File(["image"], "image.png", { type: "image/png" });
    const body = request({}, [
        { type: "image", role: "first_frame", source: file },
        { type: "image", role: "last_frame", source: file },
        { type: "audio", role: "reference", source: "https://media.example/music.mp3" },
    ]) as FormData;
    expect(body.getAll("first_frame")).toHaveLength(1);
    expect(body.getAll("last_frame")).toHaveLength(1);
    expect(body.has("input_reference[]")).toBe(false);
    expect(JSON.parse(body.get("references") as string)).toHaveLength(1);
});
