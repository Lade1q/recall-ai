// Tool declaration + config builder cho từng probe. Giữ prompt ở một chỗ.
import { Modality, Type, Behavior } from '@google/genai';

// Bề mặt AI #5 (voice) — schema cố định ở param của tool. Spike test SHAPE per-checkpoint,
// KHÔNG dùng dạng gộp (gộp = 1 call ⇒ không học được gì về R13). Xem giao thức §③.
export const recordEvidenceDeclaration = {
  name: 'record_evidence',
  // async: model bắn evidence TRONG KHI vẫn đang nói. Bỏ field này = FC đồng bộ (model dừng chờ
  // tool-response) = đo SAI cơ chế grain + false-green (spokeBefore tưởng "silent"). R13 là về đúng
  // cặp NON_BLOCKING + scheduling:SILENT (xem _respondTools). Vertex hỗ trợ scheduling, KHÔNG hỗ trợ willContinue.
  behavior: Behavior.NON_BLOCKING,
  description:
    'Ghi nhận bằng chứng cho MỘT checkpoint ngay khi checkpoint đó được giải quyết trong hội thoại. ' +
    'Gọi status="covered" khi sinh viên thể hiện HIỂU ĐÚNG một checkpoint; ' +
    'gọi status="contradicted" khi sinh viên thể hiện rõ một HIỂU-SAI đã chốt. ' +
    'TUYỆT ĐỐI KHÔNG gọi khi câu trả lời còn dở dang, mơ hồ, bị ngắt, hoặc không chắc — ' +
    'khi đó không gọi gì cho checkpoint đó (để hệ thống suy ra not_discussed).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      checkpointId: { type: Type.STRING, description: 'id checkpoint đang xét, ví dụ "cp_3"' },
      status: { type: Type.STRING, enum: ['covered', 'contradicted'] },
      quote: { type: Type.STRING, description: 'trích ngắn lời sinh viên làm bằng chứng' },
    },
    required: ['checkpointId', 'status'],
  },
};

function checkpointLines(fixture) {
  return fixture.checkpoints.map((c) => `- ${c.id}: ${c.claim}`).join('\n');
}

export function examinerSystemInstruction(fixture) {
  return `Bạn là giám khảo vấn đáp cho MỘT khái niệm: "${fixture.conceptName}".
CHỈ dùng kiến thức trong TÀI LIỆU dưới đây; không dùng kiến thức ngoài tài liệu.

TÀI LIỆU:
${fixture.materialSlice}

CÁC CHECKPOINT của khái niệm:
${checkpointLines(fixture)}

Sinh viên sẽ lần lượt phát biểu. Với MỖI phát biểu, đối chiếu với các checkpoint:
- Hiểu ĐÚNG một checkpoint   -> gọi record_evidence(checkpointId, "covered", <trích lời>).
- Hiểu SAI rõ một checkpoint  -> gọi record_evidence(checkpointId, "contradicted", <trích lời>).
- Dở dang / mơ hồ / bị ngắt / không chắc -> KHÔNG gọi record_evidence cho checkpoint đó.

Nếu chưa chắc sinh viên HIỂU SAI hay chỉ diễn đạt vụng / chưa nói xong, hãy HỎI THÊM một câu làm rõ
trước khi kết luận. Chỉ gọi contradicted SAU KHI đã cho cơ hội làm rõ mà vẫn sai. Khi còn nghi ngờ ->
không gọi gì (để hệ thống suy ra not_discussed). Thà bỏ sót một hiểu-sai còn hơn phạt oan một câu chưa xong.

Bạn KHÔNG quyết định chuyển khái niệm hay kết thúc phiên (hệ thống lo). Đối đáp NGẮN, bằng tiếng Việt.`;
}

export function examinerConfig(fixture) {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: examinerSystemInstruction(fixture),
    tools: [{ functionDeclarations: [recordEvidenceDeclaration] }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

export function questionGenConfig(fixture) {
  const system = `Bạn là giám khảo vấn đáp cho khái niệm "${fixture.conceptName}".
CHỈ dựa vào TÀI LIỆU sau, KHÔNG dùng kiến thức ngoài tài liệu, và hỏi HOÀN TOÀN bằng tiếng Việt.

TÀI LIỆU:
${fixture.materialSlice}

Đặt LẦN LƯỢT các câu hỏi vấn đáp ngắn, MỖI LƯỢT ĐÚNG MỘT CÂU, phủ các ý trong tài liệu.
Chỉ hỏi, KHÔNG tự trả lời. Khi người dùng nói "tiếp" thì hỏi câu kế tiếp.`;
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: system,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

// p1/p5: đường audio thật, client tự cầm VAD (R14: silenceDurationMs không đáng tin).
export function audioConfig(systemInstruction = 'Bạn là trợ giảng. Trả lời NGẮN GỌN bằng tiếng Việt.') {
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
  };
}
