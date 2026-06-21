import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { PaymentType } from './payment-type.enum';

function paymentTypeTitle(type: PaymentType): string {
  return type === PaymentType.SERVICE_CHARGE ? 'Service Charge Payment Receipt' : 'Rent Payment Receipt';
}

function formatReceiptDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

@Injectable()
export class PaymentReceiptPdfService {
  async renderReceiptPdf(params: {
    confirmationId: string;
    paymentType: PaymentType;
    amountDisplay: string | null;
    confirmedAt: Date;
    submittedAt: Date;
    tenantFullName: string;
    tenantEmail: string;
    unitNumber: string | null;
    propertyName: string | null;
    managerName: string;
  }): Promise<Buffer> {
    const {
      confirmationId,
      paymentType,
      amountDisplay,
      confirmedAt,
      submittedAt,
      tenantFullName,
      tenantEmail,
      unitNumber,
      propertyName,
      managerName,
    } = params;

    const label = paymentType === PaymentType.SERVICE_CHARGE ? 'Service charge' : 'Rent';
    const amount = amountDisplay?.trim() || '—';

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 48, size: 'LETTER' });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).fillColor('#0a192f').text(paymentTypeTitle(paymentType), { align: 'left' });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#555555').text('Official payment confirmation from your property manager');
      doc.moveDown(1.2);

      doc.fontSize(11).fillColor('#0a192f').text('Payment details', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#111111');
      doc.font('Helvetica-Bold').text(`${label}:`, { continued: true });
      doc.font('Helvetica').text(` ${amount}`);
      doc.font('Helvetica-Bold').text('Status:', { continued: true });
      doc.font('Helvetica').text(' Confirmed / Received');
      doc.font('Helvetica-Bold').text('Confirmed on:', { continued: true });
      doc.font('Helvetica').text(` ${formatReceiptDate(confirmedAt)} (UTC)`);
      doc.font('Helvetica-Bold').text('Receipt submitted:', { continued: true });
      doc.font('Helvetica').text(` ${formatReceiptDate(submittedAt)} (UTC)`);
      doc.font('Helvetica-Bold').text('Reference:', { continued: true });
      doc.font('Helvetica').text(` ${confirmationId}`);
      doc.moveDown(1);

      doc.fontSize(11).fillColor('#0a192f').text('Tenant', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#111111');
      doc.text(`Name: ${tenantFullName}`);
      doc.text(`Email: ${tenantEmail}`);
      if (unitNumber) {
        doc.text(`Unit: ${unitNumber}`);
      }
      if (propertyName) {
        doc.text(`Property: ${propertyName}`);
      }
      doc.moveDown(1);

      doc.fontSize(11).fillColor('#0a192f').text('Property manager', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#111111');
      doc.text(`Confirmed by: ${managerName}`);
      doc.moveDown(1.5);

      doc
        .fontSize(9)
        .fillColor('#555555')
        .text(
          'This receipt confirms that your property manager verified and recorded your payment. Keep this document for your records.',
          { align: 'left' },
        );

      doc.end();
    });
  }
}
