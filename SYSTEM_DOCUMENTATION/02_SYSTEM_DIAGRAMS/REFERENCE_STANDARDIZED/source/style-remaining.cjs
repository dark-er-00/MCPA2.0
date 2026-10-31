'use strict';

// Visual conversion only. Cell IDs, labels, page membership and edge terminals
// remain the source of truth; Model.json supplies direction and retry metadata.
const {style, setStyle, type} = require('./drawio-style-utils.cjs');

const X_SCALE = 0.487;
const Y_SCALE = 0.55;
const H_SCALE = 0.51;
const round = n => String(Math.round(n * 1000) / 1000);
const num = n => Number(n || 0);
const value = c => String(c.attrs.value || '');
const isEnd = c => /^END(?:\s+ATTEMPT)?$/i.test(value(c).trim());
const centerX = c => num(c.geometry.attrs.x) + num(c.geometry.attrs.width) / 2;
const centerY = c => num(c.geometry.attrs.y) + num(c.geometry.attrs.height) / 2;
const bottom = c => num(c.geometry.attrs.y) + num(c.geometry.attrs.height);
const xMap = x => x * X_SCALE + (x >= 900 ? 20 : 0);
const yMap = y => y * Y_SCALE - 1;

function rect(c, x, y, width, height) {
  c.geometry ||= {attrs: {as: 'geometry'}, inner: ''};
  Object.assign(c.geometry.attrs, {
    x: round(x), y: round(y), width: round(width), height: round(height),
  });
}

function restyle(flow, parsedDoc) {
  const report = {flow: flow.id, pages: [], convertedEnds: 0, removedFooters: 0};
  parsedDoc.diagrams.forEach((diagram, index) => {
    const page = flow.pages.find(p => p.id === diagram.attrs.id) || flow.pages[index];
    if (!page) throw new Error(`Missing baseline page for ${flow.id}: ${diagram.attrs.id}`);
    const modelNodes = new Map(page.nodes.map(n => [n.id, n]));
    const modelEdges = new Map(page.edges.map(e => [e.id, e]));
    const original = new Map(diagram.cells.filter(c => c.geometry).map(c => [c.attrs.id, {...c.geometry.attrs}]));
    const removed = diagram.cells.filter(c => c.attrs.vertex === '1' && type(c) === 'text' &&
      /Source-verified documentation|Legal portrait/.test(value(c)) && num(c.geometry?.attrs.y) > 2300);
    const removedIds = new Set(removed.map(c => c.attrs.id));
    diagram.cells = diagram.cells.filter(c => !removedIds.has(c.attrs.id));
    report.removedFooters += removed.length;
    Object.assign(diagram.model, {
      dx: '827', dy: '1169', page: '1', pageScale: '1',
      pageWidth: '827', pageHeight: '1169', grid: '0', gridSize: '10',
    });
    const vertices = diagram.cells.filter(c => c.attrs.vertex === '1');
    const edges = diagram.cells.filter(c => c.attrs.edge === '1');
    const byId = new Map(diagram.cells.map(c => [c.attrs.id, c]));

    for (const c of vertices) {
      const g = original.get(c.attrs.id);
      const k = type(c);
      let s = style(c);
      Object.assign(s, {
        html: '0', whiteSpace: 'wrap', fontFamily: 'Arial', fontColor: '#000000', spacing: '0',
      });
      if (k === 'text') {
        const headerKind = c.attrs.id === 'a0' || /^SITETRACE \(MCPA\)/.test(value(c)) ? 0 :
          c.attrs.id === 'a1' ? 1 : c.attrs.id === 'a2' || /^Page \d+ of \d+ \|/.test(value(c)) ? 2 : -1;
        Object.assign(s, {align: 'left', verticalAlign: 'top'});
        if (headerKind >= 0) {
          s.fontSize = ['11', '21', '10'][headerKind];
          rect(c, 40, [12, 34, 80][headerKind], 747, [22, 32, 23][headerKind]);
        } else {
          s.fontSize = /^To\s/.test(value(c)) ? '4' : '9';
          rect(c, xMap(num(g.x)), yMap(num(g.y)), num(g.width) * X_SCALE,
            Math.max(num(g.height) * H_SCALE, value(c).split('\n').length * num(s.fontSize) * 1.3));
        }
      } else {
        Object.assign(s, {
          align: 'center', verticalAlign: 'middle', fillColor: '#ffffff',
          strokeColor: '#000000', strokeWidth: '2.5',
          perimeterSpacing: '0',
        });
        let w = num(g.width) * X_SCALE;
        let h = num(g.height) * H_SCALE;
        let x = xMap(num(g.x));
        let y = yMap(num(g.y));
        if (k === 'onpage') {
          s.fontSize = '13';
          s.aspect = 'fixed';
          w = h = 34;
          x = xMap(num(g.x) + num(g.width) / 2) - w / 2;
        } else if (k === 'offpage' || isEnd(c)) {
          s = {
            shape: 'offPageConnector', size: '0.326', html: '0', whiteSpace: 'wrap',
            align: 'center', verticalAlign: 'middle', spacing: '0', spacingBottom: '18',
            fontFamily: 'Arial', fontSize: '13', fontColor: '#000000',
            strokeColor: '#000000', fillColor: '#ffffff', strokeWidth: '2.5', perimeterSpacing: '0',
          };
          w = 49;
          h = 48;
          x = xMap(num(g.x) + num(g.width) / 2) - w / 2;
          if (isEnd(c)) {
            c.attrs.value = 'XX';
            report.convertedEnds++;
          }
        } else {
          // Existing line breaks are preserved exactly. The narrowest, longest
          // feedback blocks receive the same 14/13pt exceptions as the references.
          const maxChars = Math.max(...value(c).split('\n').map(t => t.length));
          s.fontSize = String(w < 260 && maxChars > 33 ? 13 : w < 260 && maxChars > 29 ? 14 : 15);
          if (k === 'io') s.perimeter = 'parallelogramPerimeter';
        }
        rect(c, x, y, w, h);
      }
      setStyle(c, s);
    }

    // A branch runs horizontally from the diamond tip to the response border.
    // Only the response's centre is aligned; its following terminal stays below it.
    for (const e of edges) {
      const m = modelEdges.get(e.attrs.id);
      const a = byId.get(e.attrs.source), b = byId.get(e.attrs.target);
      if (m?.direction === 'right' && a && b && type(a) !== 'onpage') {
        b.geometry.attrs.y = round(centerY(a) - num(b.geometry.attrs.height) / 2);
      }
    }
    for (const e of edges) {
      const m = modelEdges.get(e.attrs.id);
      const a = byId.get(e.attrs.source), b = byId.get(e.attrs.target);
      const n = modelNodes.get(b?.attrs.id);
      if (m?.direction === 'down' && a && b && n && n.x >= 900 &&
          ['onpage', 'offpage'].includes(type(b))) {
        b.geometry.attrs.x = round(centerX(a) - num(b.geometry.attrs.width) / 2);
        b.geometry.attrs.y = round(bottom(a) + 25);
      }
    }

    const inputs = new Map();
    const inputCircles = vertices.filter(c => type(c) === 'onpage' &&
      modelNodes.get(c.attrs.id)?.direction === 'in').sort((a, b) =>
      num(byId.get(modelNodes.get(a.attrs.id).target)?.geometry?.attrs.y) -
      num(byId.get(modelNodes.get(b.attrs.id).target)?.geometry?.attrs.y));
    for (const c of inputCircles) {
      const n = modelNodes.get(c.attrs.id);
      if (type(c) !== 'onpage' || n?.direction !== 'in') continue;
      const target = byId.get(n.target);
      if (!target) throw new Error(`Missing on-page target ${flow.id} ${page.number} ${n.target}`);
      const precedingEdges = edges.filter(e => e.attrs.target === target.attrs.id &&
        e.attrs.source !== c.attrs.id && type(byId.get(e.attrs.source) || {attrs: {}}) !== 'onpage');
      const predecessor = precedingEdges.map(e => byId.get(e.attrs.source)).filter(Boolean)
        .sort((a, b) => bottom(b) - bottom(a))[0];
      let top = num(target.geometry.attrs.y);
      const gapTop = predecessor ? bottom(predecessor) : top - 40;
      // A full circle must fit in the connector gap above the input without
      // touching its slanted top edge. Leave 5px above and below its diameter.
      if (top - gapTop < 44) {
        const delta = 44 - (top - gapTop);
        for (const v of vertices) {
          if (num(v.geometry.attrs.y) >= top) {
            v.geometry.attrs.y = round(num(v.geometry.attrs.y) + delta);
          }
        }
        top = num(target.geometry.attrs.y);
      }
      const junctionY = gapTop + (top - gapTop) / 2;
      rect(c, 105, junctionY - 17, 34, 34);
      inputs.set(c.attrs.id, {target, junctionY, gap: top - gapTop});
    }

    const retryTargets = new Set([...inputs.values()].map(i => i.target.attrs.id));
    for (const e of edges) {
      const m = modelEdges.get(e.attrs.id);
      const a = byId.get(e.attrs.source), b = byId.get(e.attrs.target);
      const horizontal = m?.direction === 'right';
      const s = {
        edgeStyle: 'none', rounded: '0', html: '0', endArrow: 'block', endFill: '1',
        endSize: '6', strokeWidth: '2.5', strokeColor: '#000000',
        fontFamily: 'Arial', fontSize: '11', fontColor: '#000000',
        labelBackgroundColor: '#ffffff', perimeterSpacing: '0',
        sourcePerimeterSpacing: '0', targetPerimeterSpacing: '0',
        startSpacing: '0', endSpacing: '0', jettySize: '0',
        exitX: horizontal ? '1' : '0.5', exitY: horizontal ? '0.5' : '1',
        entryX: horizontal ? '0' : '0.5', entryY: horizontal ? '0.5' : '0',
        exitPerimeter: '1', entryPerimeter: '1',
      };
      const input = inputs.get(e.attrs.source);
      if (input && b) {
        Object.assign(s, {
          exitX: '1', exitY: '0.5', entryX: '0.5',
          entryY: round((input.junctionY - num(b.geometry.attrs.y)) / num(b.geometry.attrs.height)),
          entryPerimeter: '0', entryDx: '0', entryDy: '0',
        });
      }
      // Edges keep their original terminal IDs and their Yes/No labels. Relative
      // label geometry is retained, while obsolete model-space bends are cleared.
      e.geometry ||= {attrs: {relative: '1', as: 'geometry'}, inner: ''};
      if (!horizontal && value(e).trim() && retryTargets.has(e.attrs.target)) {
        // Keep the branch label below the horizontal retry junction. mxGraph's
        // relative x=0.6 places it at 80% of the source-to-target line.
        e.geometry.attrs.x = '0.6';
      }
      e.geometry.inner = String(e.geometry.inner || '').replace(/<Array\b[^>]*as="points"[^>]*>[\s\S]*?<\/Array>/g, '')
        .replace(/<mxPoint\b[^>]*as="(?:sourcePoint|targetPoint)"[^>]*\/>/g, '');
      setStyle(e, s);
    }

    const maxX = Math.max(...vertices.map(c => num(c.geometry.attrs.x) + num(c.geometry.attrs.width)));
    const maxY = Math.max(...vertices.map(c => bottom(c)));
    if (maxX > 827 || maxY > 1169) throw new Error(`A4 overflow in ${flow.id} page ${page.number}: ${maxX}, ${maxY}`);
    report.pages.push({page: page.number, vertices: vertices.length, edges: edges.length,
      maxX: Number(round(maxX)), maxY: Number(round(maxY)),
      returnJunctions: [...inputs.values()].map(i => ({target: i.target.attrs.id, y: Number(round(i.junctionY)), gap: Number(round(i.gap))}))});
  });
  Object.defineProperty(parsedDoc, '_layoutReport', {value: report, configurable: true});
  return parsedDoc;
}

module.exports = {restyle};
