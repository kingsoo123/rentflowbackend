import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { LeaseFormTemplateDef } from './lease-form-template';
import type { TenantLeaseFormSubmission } from './tenant-lease-form-submission.entity';

@Injectable()
export class LeaseFormPdfService {
  /**
   * Builds a single-page (or multi-page) PDF with form copy, answers, and typed signature.
   */
  async renderSubmissionPdf(params: {
    submission: TenantLeaseFormSubmission;
    template: LeaseFormTemplateDef;
    tenantFullName: string | null;
    tenantEmail: string | null;
    unitLine: string | null;
  }): Promise<Buffer> {
    const { submission, template, tenantFullName, tenantEmail, unitLine } = params;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 48, size: 'LETTER' });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(16).fillColor('#0a192f').text(template.title, { align: 'left' });
      doc.moveDown(0.6);
      doc.fontSize(10).fillColor('#333333').text(template.intro, { align: 'left' });
      doc.moveDown(1);

      doc.fontSize(11).text('Tenant', { continued: false });
      doc.fontSize(10).fillColor('#111111');
      doc.text(`Name: ${tenantFullName ?? '—'}`);
      doc.text(`Email: ${tenantEmail ?? '—'}`);
      if (unitLine) {
        doc.text(unitLine);
      }
      doc.text(`Submission ID: ${submission.id}`);
      doc.text(`Submitted (UTC): ${submission.submittedAt.toISOString()}`);
      doc.moveDown(1);

      doc.fontSize(12).fillColor('#0a192f').text('Responses', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#111111');

      for (const field of template.fields) {
        const raw = submission.answers[field.key];
        const display =
          field.type === 'checkbox'
            ? raw === 'true' || raw === '1' || raw === 'yes'
              ? 'Yes'
              : String(raw ?? '')
            : String(raw ?? '').trim() || '—';
        doc.font('Helvetica-Bold').text(`${field.label}`, { continued: false });
        doc.font('Helvetica').text(display);
        doc.moveDown(0.35);
      }

      doc.moveDown(0.8);
      doc.fontSize(11).fillColor('#0a192f').text('Electronic signature', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(12).font('Helvetica-Oblique').text(submission.signatureText.trim());
      doc.moveDown(1.2);
      doc
        .fontSize(9)
        .fillColor('#555555')
        .text(
          'By submitting this form, the tenant acknowledged the statements above and agreed that the typed name constitutes an electronic signature to the extent permitted by applicable law.',
          { align: 'left' },
        );

      doc.end();
    });
  }
}
