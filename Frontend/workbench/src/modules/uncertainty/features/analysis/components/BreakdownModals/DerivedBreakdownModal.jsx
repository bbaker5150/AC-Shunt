import * as math from 'mathjs';
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom';
import Latex from "../../../../components/common/Latex";
import { unitSystem, calculateUncertaintyFromToleranceObject } from "../../../../utils/uncertaintyMath";
import useFloatingWindow from '../../../../hooks/useFloatingWindow';

// Helper to format numbers for LaTeX display
const formatNumberForLatex = (num, precision = 4) => {
    if (typeof num !== 'number' || isNaN(num)) return 'NaN';
    // Use exponential notation for small numbers, increase precision
    if (Math.abs(num) < 1e-3 && num !== 0) {
        return num.toExponential(precision);
    }
    // Use toPrecision for other numbers
    return parseFloat(num.toPrecision(precision)).toString();
};


const DerivedBreakdownModal = ({ isOpen, onClose, breakdownData }) => {
    
    const { style: windowStyle, handleMouseDown } = useFloatingWindow({
        isOpen,
        defaultWidth: Math.min(860, window.innerWidth - 48),
        defaultHeight: Math.min(720, window.innerHeight - 120)
    });

    // --- This hook now rebuilds the formula from individual TMDEs ---
    const formulaTerms = useMemo(() => {
        const tmdes = breakdownData?.tmdeTolerances || [];
        const components = breakdownData?.results?.calculatedBudgetComponents || [];
        const derivedUnit = breakdownData?.derivedNominalPoint?.unit || 'Units';
        const targetUnitInfo = unitSystem.units[derivedUnit];
        if (!tmdes || !components || !targetUnitInfo?.to_si) return [];

        // 1. Get terms from TMDE definitions
        const tmdeTerms = tmdes.map(tmde => {
            const quantity = tmde.quantity || 1;
            const varType = tmde.variableType;

            // Find the matching component in the budget to get the symbol and ci
            const budgetComp = components.find(c => c.name.startsWith(`Input: ${varType}`));
            if (!budgetComp) return null;

            const symbolMatch = budgetComp.name?.match(/\(([^)]+)\)$/);
            const symbol = symbolMatch ? symbolMatch[1] : varType;
            const ciValue = budgetComp.sensitivityCoefficient;

            // Calculate the *individual* standard uncertainty (u_i) for this one TMDE
            const { standardUncertainty: ui_ppm } = calculateUncertaintyFromToleranceObject(tmde, tmde.measurementPoint);
            if (isNaN(ui_ppm)) return null;

            // Convert individual u_i from PPM to native absolute units (e.g., oz, in)
            const nominalValue = parseFloat(tmde.measurementPoint.value);
            const nominalInBase = unitSystem.toBaseUnit(nominalValue, tmde.measurementPoint.unit);
            const ui_absolute_base = (ui_ppm / 1e6) * Math.abs(nominalInBase);
            
            const unitInfo = unitSystem.units[tmde.measurementPoint.unit];
            if (!unitInfo || !unitInfo.to_si) return null;
            const uiValueAbsoluteNative = ui_absolute_base / unitInfo.to_si; // ui in native units (e.g., inches, oz)

            // Calculate contribution and variance in derived units
            const contributionInDerivedUnit = Math.abs(ciValue * uiValueAbsoluteNative);
            const varianceInDerivedUnitSq = contributionInDerivedUnit ** 2;

            return {
                symbolLatex: quantity > 1
                    ? `${quantity} \\cdot (c_{${symbol}} u_{${symbol}})^2`
                    : `(c_{${symbol}} u_{${symbol}})^2`,
                varianceDerivedSq: varianceInDerivedUnitSq * quantity, // Total variance for this definition
                ci: ciValue,
                ui_native: uiValueAbsoluteNative,
                ui_unit_native: tmde.measurementPoint.unit || '',
                contribution: contributionInDerivedUnit, // Contribution of a *single* unit
                varSymbol: symbol,
                name: tmde.name || 'TMDE',
                quantity: quantity,
            };
        }).filter(term => term !== null);

        // 2. Get term from Resolution (which is a 'direct' component)
        const resolutionComp = components.find(c => c.name?.includes('Resolution'));
        if (resolutionComp) {
            const symbol = 'res';
            const ciValue = 1; // By definition for direct components

            // Get ui in native absolute units (which is derivedUnit)
            let uiValueAbsoluteNative = NaN;
            if (resolutionComp.isBaseUnitValue && !isNaN(resolutionComp.value) && resolutionComp.unit) {
                const unitInfo = unitSystem.units[resolutionComp.unit];
                if (unitInfo?.to_si) {
                    uiValueAbsoluteNative = resolutionComp.value / unitInfo.to_si; // Convert base ui back to native unit
                }
            }
            
            const contributionInDerivedUnit = Math.abs(ciValue * uiValueAbsoluteNative);
            const varianceInDerivedUnitSq = contributionInDerivedUnit ** 2;

            tmdeTerms.push({
                symbolLatex: `u_{${symbol}}^2`,
                varianceDerivedSq: varianceInDerivedUnitSq,
                ci: ciValue,
                ui_native: uiValueAbsoluteNative,
                ui_unit_native: resolutionComp.unit || '',
                contribution: contributionInDerivedUnit,
                varSymbol: symbol,
                name: 'Resolution',
                quantity: 1,
            });
        }
        
        return tmdeTerms;
    }, [breakdownData]);

    // Reconstruct nominal scope for display
    const nominalScopeForDisplay = useMemo(() => {
        const scope = {}; const components = breakdownData?.results?.calculatedBudgetComponents || [];
         components.forEach(c => {
             if (c.name?.includes('Input:')) {
                 const symbolMatch = c.name.match(/\(([^)]+)\)$/); const symbol = symbolMatch ? symbolMatch[1] : null;
                 const nominalMatch = c.sourcePointLabel?.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)/); const nominalValue = nominalMatch ? parseFloat(nominalMatch[1]) : NaN;
                 if (symbol && !isNaN(nominalValue)) { scope[symbol] = nominalValue; }
             }
         }); return scope;
    }, [breakdownData]);


    // Early return
    if (!isOpen || !breakdownData || !breakdownData.results) return null;

    // Destructure data
    const { equationString, derivedNominalPoint } = breakdownData;
    let displayEquation = equationString || 'N/A';
    const equalsIndex = displayEquation.indexOf('=');
    let expressionOnly = displayEquation; if (equalsIndex !== -1) { expressionOnly = displayEquation.substring(equalsIndex + 1).trim(); }
     let equationTex = displayEquation; try { equationTex = math.parse(displayEquation).toTex(); } catch(e) {}
     let expressionTex = expressionOnly; try { expressionTex = math.parse(expressionOnly).toTex(); } catch(e) {}

    const derivedUnit = derivedNominalPoint?.unit || 'Units';

    // Calculate final combined uncertainty in derived units using the variances calculated in the memo
    const sumOfVariancesDerivedUnits = formulaTerms.reduce((sum, term) => sum + (isNaN(term.varianceDerivedSq) ? 0 : term.varianceDerivedSq), 0);
    const combinedUncertaintyInDerivedUnit = Math.sqrt(sumOfVariancesDerivedUnits);

    return ReactDOM.createPortal(
        <div 
            className="modal-content breakdown-modal-content" 
            style={{ 
                ...windowStyle, 
                zIndex: 2000,
            }}
        >
            <button onClick={onClose} className="modal-close-button">&times;</button>
            <h3 
                className="breakdown-modal-title"
                onMouseDown={handleMouseDown} 
            >
                Derived Uncertainty Calculation Breakdown
            </h3>

            <div className="modal-body-scrollable">
                {/* Equation Display */}
                <div className="breakdown-step">
                    <h5>Measurement Equation (<Latex>$y = f(x_1, x_2, ...)$</Latex>)</h5>
                    <div style={{ fontSize: '1.1em', textAlign: 'center' }}> <Latex>{`$$ ${equationTex} $$`}</Latex> </div>
                </div>

                {/* Component Breakdown Loop */}
                {formulaTerms.map((term, index) => {
                     const formattedValueUi = formatNumberForLatex(term.ui_native);
                     const displayValueUnitUi = term.ui_unit_native;
                     const formattedCi = formatNumberForLatex(term.ci);
                     const formattedContribution = (term && !isNaN(term.contribution)) ? formatNumberForLatex(term.contribution) : 'N/A';

                    let derivativeDisplay = '';
                    let derivativeTex = '';
                    // Find the original budget component to get the derivative string
                    const budgetComp = breakdownData.results.calculatedBudgetComponents.find(c => c.name.includes(`(${term.varSymbol})`));
                    if (budgetComp) {
                        derivativeDisplay = budgetComp.derivativeString;
                        if(derivativeDisplay){ try { derivativeTex = math.parse(derivativeDisplay).toTex(); } catch (e) { derivativeTex = derivativeDisplay; } }
                    } else if (term.varSymbol === 'res') {
                        derivativeTex = "1"; // Ci for resolution is 1
                    }

                    let evaluationStepTex = '';
                    if (derivativeDisplay && Object.keys(nominalScopeForDisplay).length > 0) {
                        try { const derivativeNode = math.parse(derivativeDisplay); evaluationStepTex = derivativeNode.toTex({ handler: (node, options) => { if (node.isSymbolNode && nominalScopeForDisplay.hasOwnProperty(node.name)) { return formatNumberForLatex(nominalScopeForDisplay[node.name]); } } }); evaluationStepTex = `${evaluationStepTex} = ${formattedCi}`; } catch (e) { evaluationStepTex = `${formattedCi}`; }
                    } else if (derivativeTex) { evaluationStepTex = `${derivativeTex} = ${formattedCi}`; }
                    
                    const symbol = term.varSymbol;

                    return (
                        <div className="breakdown-step" key={term.name || index}>
                            <h5>{term.name} {term.quantity > 1 ? `(x${term.quantity})` : ''}</h5>
                            <ul>
                                <li><strong>Std. Uncertainty (<Latex>{`$u_{${symbol}}$`}</Latex>):</strong> {formattedValueUi} {displayValueUnitUi} (per instance)</li>
                                
                                <li>
                                    <strong>Sensitivity Coeffcient (<Latex>{`$c_{${symbol}}$`}</Latex>):</strong>
                                    <ul style={{ listStyleType: 'none', paddingLeft: '10px' }}>
                                        {expressionTex && term.varSymbol !== 'res' && ( <li><Latex>{`$$ \\text{Calculate } c_{${symbol}} = \\frac{\\partial}{\\partial ${symbol}} \\left( ${expressionTex} \\right) $$`}</Latex></li> )}
                                        {derivativeTex && term.varSymbol !== 'res' && ( <li><Latex>{`$$ \\rightarrow c_{${symbol}} = ${derivativeTex} $$`}</Latex></li> )}
                                        {evaluationStepTex && ( <li><Latex>{`$$ \\text{Evaluate: } c_{${symbol}} = ${evaluationStepTex} $$`}</Latex></li> )}
                                    </ul>
                                </li>

                                <li><strong>Contribution (<Latex>{`$|c_{${symbol}} \\times u_{${symbol}}|$`}</Latex>):</strong> {formattedContribution} {derivedUnit} (per instance)</li>
                                {term.quantity > 1 && (
                                    <li><strong>Total Variance Term (<Latex>{`$${term.quantity} \\cdot (c_{${symbol}} u_{${symbol}})^2$`}</Latex>):</strong> {formatNumberForLatex(term.varianceDerivedSq, 5)}</li>
                                )}
                            </ul>
                            {budgetComp?.nonlinearityWarning && (
                                <p style={{ color: '#b45309', fontWeight: 600, marginTop: '6px' }}>
                                    ⚠ {budgetComp.nonlinearityWarning}
                                </p>
                            )}
                        </div>
                    );
                })}

                <div className="breakdown-step">
                    <h5>Combined Uncertainty Calculation (<Latex>{`$u_y$`}</Latex> in {derivedUnit})</h5>
                    <p>Using the formula:</p>
                    <Latex>{`$$ u_y = \\sqrt{\\sum_{i} (c_i u_i)^2 + \\sum_{j} u_j^2} $$`}</Latex>
                    <Latex>{`$$ u_y = \\sqrt{${formulaTerms.map(t => t.symbolLatex).join(" + ")}} $$`}</Latex>

                    <p>Plugging in values (showing total variance for each term):</p>
                    <Latex>{`$$ u_y = \\sqrt{${formulaTerms.map(t => isNaN(t.varianceDerivedSq) ? 'NaN' : formatNumberForLatex(t.varianceDerivedSq, 5)).join(" + ")}} $$`}</Latex>
                    <Latex>{`$$ u_y = \\sqrt{${formatNumberForLatex(sumOfVariancesDerivedUnits, 5)}} = \\mathbf{${formatNumberForLatex(combinedUncertaintyInDerivedUnit, 5)}} \\text{ (${derivedUnit})} $$`}</Latex>

                    <hr style={{margin: '15px 0'}}/>
                     <strong>Final Combined Uncertainty (<Latex>$u_y$</Latex>): {isNaN(combinedUncertaintyInDerivedUnit) ? 'N/A' : `${combinedUncertaintyInDerivedUnit.toPrecision(5)} ${derivedUnit}`}</strong>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default DerivedBreakdownModal;
