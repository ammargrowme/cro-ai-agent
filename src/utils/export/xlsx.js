/**
 * Excel (.xlsx) export — multi-sheet workbook.
 * Uses SheetJS (xlsx) library, lazy-loaded to avoid bundle bloat.
 *
 * Sheets:
 * 1. Executive Summary — score, summary, strengths, quick wins
 * 2. Checklist Scores — 10 categories with scores
 * 3. Recommendations — full detail table
 * 4. Competitor Analysis — comparison data (if available)
 * 5. Page Scores — per-page data (if available)
 */
import { CHECKLIST_LABELS } from '../../constants/checklistLabels';

export const exportXLSX = async (report, url) => {
  if (!report) return;

  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // Sheet 1: Executive Summary
  const summaryData = [
    ['GROWAGENT CRO Audit Report'],
    ['Website', url],
    ['Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Overall Score', report.overall_score],
    [''],
    ['Summary', report.summary || ''],
    [''],
    ['Strengths'],
    ...(report.strengths || []).map(s => ['', s]),
    [''],
    ['Quick Wins'],
    ...(report.quick_wins || []).map(q => ['', q]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
  ws1['!cols'] = [{ wch: 20 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Executive Summary');

  // Sheet 2: Checklist Scores
  const checklistData = [
    ['Category', 'Score (0-100)', 'Status'],
    ...Object.entries(report.checklist_scores || {}).map(([key, score]) => [
      CHECKLIST_LABELS[key] || key.replace(/_/g, ' '),
      score,
      score >= 80 ? 'Good' : score >= 50 ? 'Needs Work' : 'Critical'
    ])
  ];
  if (report.checklist_flags?.length > 0) {
    checklistData.push([''], ['Critical Failures']);
    report.checklist_flags.forEach(f => checklistData.push(['', f]));
  }
  const ws2 = XLSX.utils.aoa_to_sheet(checklistData);
  ws2['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Checklist Scores');

  // Sheet 3: Recommendations
  const recsData = [
    ['#', 'Priority', 'Category', 'Issue', 'Recommendation', 'Expected Impact', 'Implementation', 'Checklist Ref'],
    ...(report.recommendations || []).map((r, i) => [
      i + 1, r.priority, r.category, r.issue, r.recommendation,
      r.expected_impact, r.implementation, r.checklist_ref || ''
    ])
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(recsData);
  ws3['!cols'] = [{ wch: 4 }, { wch: 8 }, { wch: 12 }, { wch: 35 }, { wch: 35 }, { wch: 25 }, { wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Recommendations');

  // Sheet 4: Competitor Analysis (if available)
  if (report.competitor_analysis?.comparisons?.length > 0) {
    const compData = [['Competitor', 'Key Difference', 'Your Advantage', 'Steal-Worthy Ideas']];
    report.competitor_analysis.comparisons.forEach(c => {
      compData.push([
        c.competitor,
        c.difference,
        c.advantage,
        (c.steal_worthy || []).join('; ')
      ]);
    });
    // Score comparison
    if (report.competitor_analysis.comparisons.some(c => c.competitor_scores)) {
      compData.push([''], ['Score Comparison']);
      const header = ['Category', 'Your Site', ...report.competitor_analysis.comparisons.map(c => c.competitor)];
      compData.push(header);
      Object.entries(CHECKLIST_LABELS).forEach(([key, label]) => {
        const row = [label, report.checklist_scores?.[key] || 0];
        report.competitor_analysis.comparisons.forEach(c => {
          row.push(c.competitor_scores?.[key] ?? '');
        });
        compData.push(row);
      });
    }
    const ws4 = XLSX.utils.aoa_to_sheet(compData);
    ws4['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 35 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Competitors');
  }

  // Sheet 5: Page Scores (if available)
  if (report.page_scores?.length > 0) {
    const pageData = [
      ['URL', 'Page Type', 'Score', 'Top Issues'],
      ...report.page_scores.map(p => [
        p.url, p.page_type || '', p.overall_score,
        (p.top_issues || []).join('; ')
      ])
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(pageData);
    ws5['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 8 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Page Scores');
  }

  // Download
  const hostname = (() => { try { return new URL(url).hostname; } catch { return 'report'; } })();
  XLSX.writeFile(wb, `GrowAgent_${hostname}_CRO_Report.xlsx`);
};
