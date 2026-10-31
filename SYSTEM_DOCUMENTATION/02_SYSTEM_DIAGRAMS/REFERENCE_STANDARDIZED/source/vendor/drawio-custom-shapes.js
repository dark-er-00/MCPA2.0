/**
 * Copyright (c) 2006-2015, JGraph Holdings Ltd
 *
 * Minimal draw.io shape/perimeter definitions, extracted unchanged from:
 * https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/js/grapheditor/Shapes.js
 * Retrieved 2026-10-23. Apache-2.0; see LICENSE-drawio.txt in this directory.
 * Requires the mxGraph browser globals. No editor, networking, or custom handles.
 * Both shapes retain draw.io's ordinary inherited/default perimeter behavior.
 * The parallelogramPerimeter function is registered for styles naming it explicitly.
 */
// Upstream SHA-256: a7868ff60cad0b17e1ba3b83eeff668433d58d44b2dd8c8c4bc3ab47e90366dd
(function () {
	// Parallelogram shape
	function ParallelogramShape()
	{
		mxActor.call(this);
	};

	mxUtils.extend(ParallelogramShape, mxActor);

	ParallelogramShape.prototype.size = 0.2;

	ParallelogramShape.prototype.fixedSize = 20;

	ParallelogramShape.prototype.isRoundable = function()
	{
		return true;
	};

	ParallelogramShape.prototype.redrawPath = function(c, x, y, w, h)
	{
		var fixed = mxUtils.getValue(this.style, 'fixedSize', '0') != '0';

		var dx = (fixed) ? Math.max(0, Math.min(w, parseFloat(mxUtils.getValue(this.style, 'size', this.fixedSize)))) : w * Math.max(0, Math.min(1, parseFloat(mxUtils.getValue(this.style, 'size', this.size))));
		var arcSize = mxUtils.getValue(this.style, mxConstants.STYLE_ARCSIZE, mxConstants.LINE_ARCSIZE) / 2;
		this.addPoints(c, [new mxPoint(0, h), new mxPoint(dx, 0), new mxPoint(w, 0), new mxPoint(w - dx, h)],
				this.isRounded, arcSize, true);
		c.end();
	};

	mxCellRenderer.registerShape('parallelogram', ParallelogramShape);

	function getOutlinePerimeterPoint(bounds, points, next, orthogonal, range)
	{
		range = (range != null) ? range : bounds;
		var x = range.x;
		var y = range.y;
		var w = range.width;
		var h = range.height;
		var center = new mxPoint(bounds.getCenterX(), bounds.getCenterY());
		var result = null;

		if (orthogonal)
		{
			var p1 = center.clone();

			if (next.x < x || next.x > x + w)
			{
				p1.y = next.y;
				result = mxUtils.getPerimeterPoint(points, p1, next);

				if (result == null)
				{
					p1.x = (next.x > p1.x) ? x - 1 : x + w + 1;
					result = mxUtils.getPerimeterPoint(points, p1, next);
				}
			}
			else
			{
				p1.x = next.x;
				result = mxUtils.getPerimeterPoint(points, p1, next);

				if (result == null && (next.y < y || next.y > y + h))
				{
					p1.y = (next.y > p1.y) ? y - 1 : y + h + 1;
					result = mxUtils.getPerimeterPoint(points, p1, next);
				}
			}
		}

		return (result != null) ? result : mxUtils.getPerimeterPoint(points, center, next);
	};

	// Parallelogram Perimeter
	mxPerimeter.ParallelogramPerimeter = function (bounds, vertex, next, orthogonal)
	{
		var fixed = mxUtils.getValue(vertex.style, 'fixedSize', '0') != '0';
		var size = (fixed) ? ParallelogramShape.prototype.fixedSize : ParallelogramShape.prototype.size;
		
		if (vertex != null)
		{
			size = mxUtils.getValue(vertex.style, 'size', size);
		}
		
		if (fixed)
		{
			size *= vertex.view.scale;
		}
		
		var x = bounds.x;
		var y = bounds.y;
		var w = bounds.width;
		var h = bounds.height;

		var direction = (vertex != null) ? mxUtils.getValue(
			vertex.style, mxConstants.STYLE_DIRECTION,
			mxConstants.DIRECTION_EAST) : mxConstants.DIRECTION_EAST;
		var vertical = direction == mxConstants.DIRECTION_NORTH ||
			direction == mxConstants.DIRECTION_SOUTH;
		var points;
		
		if (vertical)
		{
			var dy = (fixed) ? Math.max(0, Math.min(h, size)) : h * Math.max(0, Math.min(1, size));
			points = [new mxPoint(x, y), new mxPoint(x + w, y + dy),
						new mxPoint(x + w, y + h), new mxPoint(x, y + h - dy), new mxPoint(x, y)];
		}
		else
		{
			var dx = (fixed) ? Math.max(0, Math.min(w * 0.5, size)) : w * Math.max(0, Math.min(1, size));
			points = [new mxPoint(x + dx, y), new mxPoint(x + w, y),
							new mxPoint(x + w - dx, y + h), new mxPoint(x, y + h), new mxPoint(x + dx, y)];
		}	
		
		return getOutlinePerimeterPoint(bounds, points, next, orthogonal);
	};
	
	mxStyleRegistry.putValue('parallelogramPerimeter', mxPerimeter.ParallelogramPerimeter);

	// Off page connector
	function OffPageConnectorShape()
	{
		mxActor.call(this);
	};

	mxUtils.extend(OffPageConnectorShape, mxActor);

	OffPageConnectorShape.prototype.size = 3 / 8;

	OffPageConnectorShape.prototype.isRoundable = function()
	{
		return true;
	};
	OffPageConnectorShape.prototype.redrawPath = function(c, x, y, w, h)
	{
		var s = h * Math.max(0, Math.min(1, parseFloat(mxUtils.getValue(this.style, 'size', this.size))));
		var arcSize = mxUtils.getValue(this.style, mxConstants.STYLE_ARCSIZE, mxConstants.LINE_ARCSIZE) / 2;
		this.addPoints(c, [new mxPoint(0, 0), new mxPoint(w, 0), new mxPoint(w, h - s), new mxPoint(w / 2, h),
		                   new mxPoint(0, h - s)], this.isRounded, arcSize, true);
		c.end();
	};

	mxCellRenderer.registerShape('offPageConnector', OffPageConnectorShape);
})();
