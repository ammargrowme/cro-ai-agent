/**
 * Word Document (.docx) export.
 * Uses the `docx` library (lazy-loaded) to generate a professional report.
 * Includes title page, executive summary, checklist scores, recommendations.
 */
import { CHECKLIST_LABELS } from '../../constants/checklistLabels';

export const exportDOCX = async (report, url) => {
  if (!report) return;

  const docxLib = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType } = docxLib;

  const hostname = (() => { try { return new URL(url).hostname; } catch { return url; } })();

  // Color helper
  const scoreColorHex = (s) => s >= 80 ? '16A34A' : s >= 50 ? 'CA8A04' : 'DC2626';

  // Build sections
  const children = [];

  // ─── Title Page ───
  children.push(
    new Paragraph({ spacing: { before: 4000 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'GROWAGENT', bold: true, size: 56, color: 'F25430', font: 'Helvetica' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: 'CRO Audit Intelligence Report', size: 28, color: '6E7380', font: 'Helvetica' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
      children: [new TextRun({ text: url, bold: true, size: 24, font: 'Helvetica' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        size: 22, color: '6E7380'
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800 },
      children: [new TextRun({
        text: `Overall Score: ${report.overall_score}/100`,
        bold: true, size: 48, color: scoreColorHex(report.overall_score)
      })],
    }),
    new Paragraph({ spacing: { before: 600 }, children: [] }), // Spacer
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: report.summary || '', size: 22, color: '23252A' })],
    }),
    new Paragraph({ pageBreakBefore: true, children: [] }),
  );

  // ─── Executive Summary ───
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Executive Summary', bold: true, color: 'F25430' })] }),
  );

  if (report.strengths?.length > 0) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "What's Working", color: '16A34A' })] }));
    report.strengths.forEach(s => {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: s, size: 22 })] }));
    });
  }

  if (report.quick_wins?.length > 0) {
    children.push(new Paragraph({ spacing: { before: 200 }, heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Quick Wins', color: 'CA8A04' })] }));
    report.quick_wins.forEach(q => {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: q, size: 22 })] }));
    });
  }

  // ─── Checklist Scores Table ───
  if (report.checklist_scores && Object.keys(report.checklist_scores).length > 0) {
    children.push(
      new Paragraph({ spacing: { before: 400 }, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'CRO Checklist Scores', bold: true, color: 'F25430' })] }),
    );

    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Category', bold: true, size: 20 })] })], shading: { type: ShadingType.SOLID, color: 'F0F1F3' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Score', bold: true, size: 20 })] })], shading: { type: ShadingType.SOLID, color: 'F0F1F3' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true, size: 20 })] })], shading: { type: ShadingType.SOLID, color: 'F0F1F3' } }),
      ]
    });

    const dataRows = Object.entries(report.checklist_scores).map(([key, score]) => {
      const status = score >= 80 ? 'Good' : score >= 50 ? 'Needs Work' : 'Critical';
      return new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: CHECKLIST_LABELS[key] || key, size: 20 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${score}`, bold: true, size: 20, color: scoreColorHex(score) })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: status, size: 20, color: scoreColorHex(score) })] })] }),
        ]
      });
    });

    children.push(new Table({ rows: [headerRow, ...dataRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  // ─── Critical Failures ───
  if (report.checklist_flags?.length > 0) {
    children.push(
      new Paragraph({ spacing: { before: 400 }, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Critical Failures', bold: true, color: 'DC2626' })] }),
    );
    report.checklist_flags.forEach(f => {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: f, size: 22, color: 'DC2626' })] }));
    });
  }

  // ─── Recommendations ───
  children.push(
    new Paragraph({ spacing: { before: 400 }, pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Prioritized Recommendations', bold: true, color: 'F25430' })] }),
  );

  (report.recommendations || []).forEach((rec, i) => {
    const prioColor = rec.priority === 'High' ? 'DC2626' : rec.priority === 'Low' ? '16A34A' : 'CA8A04';
    children.push(
      new Paragraph({
        spacing: { before: 300 },
        children: [
          new TextRun({ text: `#${i + 1} `, bold: true, size: 24, color: 'F25430' }),
          new TextRun({ text: `[${(rec.priority || 'Medium').toUpperCase()}] `, bold: true, size: 20, color: prioColor }),
          new TextRun({ text: rec.category || 'General', bold: true, size: 20, color: '6E7380' }),
        ]
      }),
      new Paragraph({ children: [new TextRun({ text: rec.issue || '', bold: true, size: 22 })] }),
      new Paragraph({ children: [new TextRun({ text: rec.recommendation || '', size: 22 })] }),
      new Paragraph({
        spacing: { before: 100 },
        children: [
          new TextRun({ text: 'Impact: ', bold: true, size: 20, color: '16A34A' }),
          new TextRun({ text: rec.expected_impact || 'N/A', size: 20 }),
        ]
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Implementation: ', bold: true, size: 20, color: 'F25430' }),
          new TextRun({ text: rec.implementation || 'N/A', size: 20 }),
        ]
      }),
    );
    if (rec.checklist_ref) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Checklist: ', bold: true, size: 18, color: '6E7380' }),
          new TextRun({ text: rec.checklist_ref, size: 18, color: '6E7380' }),
        ]
      }));
    }
  });

  // ─── Footer ───
  children.push(
    new Paragraph({ spacing: { before: 600 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Generated by GROWAGENT | AI-Powered CRO Analysis | growme.ca', size: 18, color: '6E7380' })],
    }),
  );

  // Build and download
  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: { run: { font: 'Helvetica', size: 22 } },
        heading1: { run: { font: 'Helvetica', size: 32, bold: true } },
        heading2: { run: { font: 'Helvetica', size: 26, bold: true } },
      }
    }
  });

  const buffer = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(buffer);
  a.download = `GrowAgent_${hostname}_CRO_Report.docx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
