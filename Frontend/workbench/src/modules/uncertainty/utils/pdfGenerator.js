import * as PDFLib from 'pdf-lib';
const { rgb } = PDFLib;

class PdfPageManager {
  constructor(pdfDoc, font, boldFont, pageOptions) {
    this.pdfDoc = pdfDoc;
    this.font = font;
    this.boldFont = boldFont;
    this.pageOptions = pageOptions;
    this.width = pageOptions.width;
    this.height = pageOptions.height;
    this.margins = pageOptions.margins;
    this.lineHeight = pageOptions.lineHeight;
    this.fontSize = pageOptions.fontSize;
    this.page = null;
    this.y = 0;
    this.addNewPage();
  }

  addNewPage() {
    this.page = this.pdfDoc.addPage([this.width, this.height]);
    this.y = this.height - this.margins.top;
  }

  checkAddPage(spaceNeeded = this.lineHeight) {
    if (this.y - spaceNeeded < this.margins.bottom) {
      this.addNewPage();
      return true; 
    }
    return false; 
  }

  addVerticalSpace(space) {
    if (this.y - space < this.margins.bottom) {
      this.addNewPage();
    } else {
      this.y -= space;
    }
  }

  async drawText(text, options = {}) {
    const {
      font = this.font,
      fontSize = this.fontSize,
      indent = 0,
      yOffset = 0,
      color = rgb(0, 0, 0),
      wrap = true,
      align = 'left',
    } = options;

    this.checkAddPage(fontSize);
    this.y -= (yOffset + (options.lineHeight || this.lineHeight));

    const maxWidth = this.width - this.margins.left - this.margins.right - indent;
    
    // ---  Handle Newlines Manually ---
    // 1. Split text by explicit newlines first to respect paragraphs
    const paragraphs = String(text).split(/\r\n|\r|\n/g);
    
    let lines = [];

    for (const paragraph of paragraphs) {
      // If the paragraph is empty (double enter), we still need to push an empty line to advance Y
      if (paragraph === '') {
        lines.push('');
        continue;
      }

      if (wrap) {
        let currentLine = '';
        const words = paragraph.split(' '); 
        
        for (const word of words) {
          // Check if adding the next word exceeds width
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);
          
          if (testWidth <= maxWidth) {
            currentLine = testLine;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        // Push the remainder of the paragraph
        if (currentLine) lines.push(currentLine);
      } else {
        // No wrapping requested, just push the paragraph as is
        lines.push(paragraph);
      }
    }
    // --- FIX END ---

    for (const line of lines) {
      if (this.checkAddPage(fontSize)) {
         this.y -= (options.lineHeight || this.lineHeight);
      }
      
      let x = this.margins.left + indent;
      if (align === 'right') {
        const textWidth = font.widthOfTextAtSize(line, fontSize);
        x = this.width - this.margins.right - textWidth - indent;
      }

      // Only draw if line has content (otherwise just advance Y)
      if (line && line.trim().length > 0) {
        this.page.drawText(line, {
          x: x, 
          y: this.y,
          size: fontSize,
          font: font,
          color: color,
        });
      }
      
      // Move Y down for the next line
      if (lines.length > 0) {
         this.y -= (options.lineHeight || this.lineHeight);
      }
    }
  }

  async drawLine(yOffset = 5, indent = 0, color = rgb(0.8, 0.8, 0.8), thickness = 1) {
    this.checkAddPage(yOffset * 2 + 2);
    this.y -= yOffset;
    this.page.drawLine({
      start: { x: this.margins.left + indent, y: this.y },
      end: { x: this.width - this.margins.right - indent, y: this.y },
      thickness: thickness,
      color: color,
    });
    this.y -= yOffset;
  }

  async drawSectionHeader(text) {
    this.checkAddPage(this.lineHeight * 3);
    this.y -= this.lineHeight; 
    await this.drawText(text, {
      font: this.boldFont,
      fontSize: this.fontSize + 2,
      color: rgb(0.1, 0.3, 0.7),
    });
    this.page.drawLine({
      start: { x: this.margins.left, y: this.y - 3 },
      end: { x: this.width - this.margins.right, y: this.y - 3 },
      thickness: 1.5,
      color: rgb(0.1, 0.3, 0.7),
    });
    this.y -= 5;
  }
  
  async drawSubheader(text, indent = 0) { 
    this.checkAddPage(this.lineHeight * 2);
    this.y -= this.lineHeight * 0.5; 
    await this.drawText(text, {
      font: this.boldFont,
      fontSize: this.fontSize,
      indent: indent, 
    });
    this.y -= this.lineHeight * 0.5;
  }
}

export const generateOverviewReport = async (pdfDoc, session, fonts, helpers) => {
  const { 
    getToleranceSummary, 
    calculateUncertaintyFromToleranceObject, 
    convertPpmToUnit, 
    getAbsoluteLimits 
  } = helpers;

  const pageOptions = {
    width: 595.28, 
    height: 841.89, 
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    fontSize: 10,
    lineHeight: 14,
  };
  const manager = new PdfPageManager(pdfDoc, fonts.regular, fonts.bold, pageOptions);

  await manager.drawText(`${session.name || "N/A"}`, {
    font: manager.boldFont,
    fontSize: 16,
    yOffset: -10, 
  });
  await manager.drawLine(10, 0, rgb(0.1, 0.1, 0.1), 1.5);

  const headerTopY = manager.y; 

  await manager.drawText(`Analyst: ${session.analyst || "N/A"}`, {
    align: 'right',
    wrap: false 
  });
  await manager.drawText(`Date: ${session.documentDate || "N/A"}`, {
    align: 'right',
    wrap: false
  });
  const rightColumnBottomY = manager.y; 

  manager.y = headerTopY; 
  await manager.drawText(`UUT Name: ${session.uutDescription || "N/A"}`); 
  await manager.drawText(`Organization: ${session.organization || "N/A"}`); 
  await manager.drawText(`Document: ${session.document || "N/A"}`); 
  await manager.drawText(`UUT Tolerance: ${getToleranceSummary(session.uutTolerance)}`);
  
  manager.y = Math.min(manager.y, rightColumnBottomY); 
  
  if (session.notes) {
    manager.addVerticalSpace(10);
    await manager.drawText("Analysis Notes:", { font: manager.boldFont });
    // This call previously failed on newlines
    await manager.drawText(session.notes, {
      indent: 10,
      color: rgb(0.3, 0.3, 0.3),
      wrap: true 
    });
  }

  if (!session.testPoints || session.testPoints.length === 0) {
    await manager.drawSectionHeader("No Measurement Points");
    return;
  }

  const cardIndent = 15; 
  const contentIndent = cardIndent + 10; 

  for (const tp of session.testPoints) {
    const tpParam = tp.testPointInfo?.parameter;
    const pointTitle = tpParam
      ? `${tpParam.name}: ${tpParam.value} ${tpParam.unit}`
      : "Unknown Measurement Point";
    
    manager.addVerticalSpace(20);
    await manager.drawLine(0, cardIndent); 
    manager.addVerticalSpace(5); 

    await manager.drawText(pointTitle, {
      font: manager.boldFont,
      fontSize: manager.fontSize + 2,
      color: rgb(0.1, 0.3, 0.7),
      indent: cardIndent,
    });
    manager.addVerticalSpace(10);
    
    await manager.drawSubheader("Risk Metrics", cardIndent); 

    if (tp.riskMetrics) {
      const risk = tp.riskMetrics;
      // Using optional chaining and null coalescing to be safe
      await manager.drawText(`- Expanded Uncertainty: ${risk.expandedUncertainty?.toPrecision(4) ?? "N/A"} ${risk.nativeUnit}`, { indent: contentIndent });
      await manager.drawText(`- UUT Tolerance Limits: ${risk.LLow ?? "N/A"} to ${risk.LUp ?? "N/A"} ${risk.nativeUnit}`, { indent: contentIndent });
      await manager.drawText(`- PFA: ${risk.pfa?.toFixed(4) ?? "N/A"} %`, { indent: contentIndent });
      await manager.drawText(`- PFR: ${risk.pfr?.toFixed(4) ?? "N/A"} %`, { indent: contentIndent });
      await manager.drawText(`- TUR: ${risk.tur?.toFixed(2) ?? "N/A"} : 1`, { indent: contentIndent });
      await manager.drawText(`- TAR: ${risk.tar?.toFixed(2) ?? "N/A"} : 1`, { indent: contentIndent });
    } else {
      await manager.drawText("- Not Calculated", { indent: contentIndent });
    }
    
    manager.addVerticalSpace(10);

    await manager.drawSubheader("TMDE Information", cardIndent); 

    if (!tp.tmdeTolerances || tp.tmdeTolerances.length === 0) {
      await manager.drawText("- None assigned", { indent: contentIndent });
    } else {
      for (const tmde of tp.tmdeTolerances) {
        const refPoint = tmde.measurementPoint;
        if (!refPoint) continue; 
        
        const { standardUncertainty: uPpm } = calculateUncertaintyFromToleranceObject(tmde, refPoint);
        const stdUncAbs = convertPpmToUnit(uPpm, refPoint.unit, refPoint);
        const stdUncDisplay = typeof stdUncAbs === "number"
            ? `${stdUncAbs.toPrecision(3)} ${refPoint.unit}`
            : "N/A";
        const limits = getAbsoluteLimits(tmde, refPoint);

        await manager.drawText(`- ${tmde.name || "TMDE"} (Qty: ${tmde.quantity || 1})`, { indent: contentIndent, font: manager.boldFont });
        const subIndent = contentIndent + 10;
        if (tp.measurementType === 'derived' && tmde.variableType) {
          await manager.drawText(`- Equation Input: ${tmde.variableType}`, { indent: subIndent });
        }
        await manager.drawText(`- Nominal Point: ${refPoint.value} ${refPoint.unit}`, { indent: subIndent });
        await manager.drawText(`- Tolerance Spec: ${getToleranceSummary(tmde)}`, { indent: subIndent });
        await manager.drawText(`- Calculated Limits: ${limits.low} to ${limits.high}`, { indent: subIndent });
        await manager.drawText(`- Std. Uncertainty (ui): ${stdUncDisplay}`, { indent: subIndent });
        manager.addVerticalSpace(5); 
      }
    }

    manager.addVerticalSpace(5); 
    await manager.drawLine(0, cardIndent);
  }
};