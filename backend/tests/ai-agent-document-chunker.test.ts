/**
 * ai-agent-document-chunker.test.ts — cắt tài liệu chăm sóc khách hàng.
 *
 * Chunk sai = agent tìm không ra tài liệu = trả lời không căn cứ, nên đây là
 * lớp bảo vệ đầu tiên của tính năng.
 */
import { describe, it, expect } from 'vitest';
import { chunkDocument, estimateTokens } from '../src/modules/ai-agent/document-chunker.js';

describe('estimateTokens', () => {
  it('ước lượng theo độ dài, không trả 0 cho chuỗi có nội dung', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('căn hộ')).toBeGreaterThan(0);
    expect(estimateTokens('a'.repeat(320))).toBe(100);
  });
});

describe('chunkDocument', () => {
  it('gắn heading gần nhất cho từng chunk', () => {
    const doc = [
      '# Bảng giá',
      'Căn 2 phòng ngủ giá 3.2 tỷ, diện tích 68m2, ban công hướng Đông Nam.',
      '',
      '# Chính sách thanh toán',
      'Thanh toán 30% khi ký hợp đồng, phần còn lại theo tiến độ xây dựng.',
    ].join('\n');

    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe('Bảng giá');
    expect(chunks[0].content).toContain('3.2 tỷ');
    expect(chunks[1].heading).toBe('Chính sách thanh toán');
    expect(chunks[1].content).toContain('30%');
  });

  it('đánh chunkIndex liên tục từ 0', () => {
    const doc = Array.from({ length: 5 }, (_, i) => `# Mục ${i}\nNội dung đủ dài cho mục số ${i} ở đây.`).join('\n\n');
    const chunks = chunkDocument(doc);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('loại chunk quá ngắn (nhiễu, không mang thông tin)', () => {
    const doc = '# A\nok\n\n# B\nĐây là một đoạn nội dung đủ dài để được giữ lại trong kho tài liệu.';
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBe('B');
  });

  it('cắt đoạn dài thành nhiều chunk có overlap', () => {
    // Câu đánh số để kiểm chứng được chính xác câu nào lặp lại giữa 2 chunk.
    const sentences = Array.from(
      { length: 60 },
      (_, i) => `Điều khoản số ${i} quy định rõ trách nhiệm của hai bên trong hợp đồng mua bán căn hộ.`,
    );
    const chunks = chunkDocument(`# Giới thiệu\n${sentences.join(' ')}`);

    expect(chunks.length).toBeGreaterThan(1);
    // Mọi chunk đều mang heading của mục để không mất ngữ cảnh khi nhồi prompt.
    expect(chunks.every((c) => c.heading === 'Giới thiệu')).toBe(true);
    // Overlap: câu cuối của chunk N phải xuất hiện lại trong chunk N+1.
    const lastSentenceOfFirst = chunks[0].content.trim().split(/(?<=\.)\s+/).pop()!;
    expect(chunks[1].content).toContain(lastSentenceOfFirst);
    // Và không mất câu nào: câu cuối cùng của tài liệu vẫn nằm trong chunk cuối.
    expect(chunks[chunks.length - 1].content).toContain('Điều khoản số 59');
  });

  it('giữ nguyên dấu tiếng Việt', () => {
    const doc = '# Ưu đãi\nChiết khấu 5% cho khách thanh toán sớm, tặng gói nội thất trị giá 200 triệu.';
    const chunks = chunkDocument(doc);
    expect(chunks[0].content).toContain('Chiết khấu');
    expect(chunks[0].content).toContain('triệu');
  });

  it('tài liệu rỗng trả về mảng rỗng, không ném lỗi', () => {
    expect(chunkDocument('')).toEqual([]);
    expect(chunkDocument('   \n\n  ')).toEqual([]);
  });

  it('nội dung không có heading vẫn chunk được (heading = null)', () => {
    const doc = 'Công ty làm việc từ 8h đến 17h30 các ngày trong tuần, nghỉ chủ nhật.';
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].heading).toBeNull();
  });
});
