import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import type { LeaseAgreement } from './lease-agreement.entity';

@Injectable()
export class LeasePdfService {
  async renderLeasePdf(params: {
    lease: LeaseAgreement;
    propertyName: string;
    tenantFullName: string | null;
    tenantEmail: string | null;
    managerFullName: string | null;
  }): Promise<Buffer> {
    const { lease, propertyName, tenantFullName, tenantEmail, managerFullName } =
      params;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 48, size: 'LETTER' });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.fontSize(18).fillColor('#0a192f').text(lease.title, { align: 'left' });
      doc.moveDown(0.4);
      doc
        .fontSize(10)
        .fillColor('#555555')
        .text(`Lease ID: ${lease.id}`)
        .text(`Status: ${lease.status}`)
        .text(`Generated (UTC): ${new Date().toISOString()}`);
      doc.moveDown(0.8);

      doc.fontSize(12).fillColor('#0a192f').text('Parties & premises', { underline: true });
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor('#111111');
      doc.text(`Property: ${propertyName}`);
      if (lease.unitLabel) {
        doc.text(`Unit: ${lease.unitLabel}`);
      }
      doc.text(`Tenant: ${tenantFullName ?? '—'} (${tenantEmail ?? '—'})`);
      doc.text(`Property manager: ${managerFullName ?? '—'}`);
      doc.moveDown(0.8);

      doc.fontSize(12).fillColor('#0a192f').text('Term & rent', { underline: true });
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor('#111111');
      doc.text(`Start date: ${String(lease.startDate).slice(0, 10)}`);
      doc.text(`End date: ${String(lease.endDate).slice(0, 10)}`);
      doc.text(`Rent: ${lease.rentAmount}`);
      if (lease.securityDeposit) {
        doc.text(`Security deposit: ${lease.securityDeposit}`);
      }
      if (lease.paymentFrequency) {
        doc.text(`Payment frequency: ${lease.paymentFrequency}`);
      }
      doc.moveDown(0.8);

      doc.fontSize(12).fillColor('#0a192f').text('Lease terms', { underline: true });
      doc.moveDown(0.35);
      doc.fontSize(10).fillColor('#111111').text(lease.termsText, { align: 'left' });
      doc.moveDown(1);

      doc.fontSize(12).fillColor('#0a192f').text('Signatures', { underline: true });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor('#111111');
      if (lease.tenantSignatureName && lease.tenantSignedAt) {
        doc
          .font('Helvetica-Oblique')
          .text(lease.tenantSignatureName)
          .font('Helvetica')
          .text(`Tenant signed (UTC): ${new Date(lease.tenantSignedAt).toISOString()}`);
      } else {
        doc.text('Tenant signature: pending');
      }
      doc.moveDown(0.5);
      if (lease.managerSignatureName && lease.managerSignedAt) {
        doc
          .font('Helvetica-Oblique')
          .text(lease.managerSignatureName)
          .font('Helvetica')
          .text(
            `Manager countersigned (UTC): ${new Date(lease.managerSignedAt).toISOString()}`,
          );
      } else {
        doc.text('Manager countersignature: pending');
      }

      if (lease.terminatedAt) {
        doc.moveDown(0.8);
        doc.fontSize(12).fillColor('#0a192f').text('Termination', { underline: true });
        doc.moveDown(0.35);
        doc
          .fontSize(10)
          .fillColor('#111111')
          .text(`Terminated (UTC): ${new Date(lease.terminatedAt).toISOString()}`);
        if (lease.terminationReason) {
          doc.text(`Reason: ${lease.terminationReason}`);
        }
      }

      doc.moveDown(1.2);
      doc
        .fontSize(8)
        .fillColor('#666666')
        .text(
          'Typed names above constitute electronic signatures to the extent permitted by applicable law. This PDF is the executed lease record in EstateFlow / Rent Pilot.',
        );

      doc.end();
    });
  }
}
