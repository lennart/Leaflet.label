L.Label = L.Class.extend({

	includes: L.Mixin.Events,

	_directions: [ 'top', 'right', 'bottom', 'left' ],

	options: {
		className: '',
		clickable: false,
		direction: 'right',
		noHide: false,
		offset: [12, -15], // 6 (width of the label triangle) + 6 (padding)
		opacity: 1,
		zoomAnimation: true
	},

	initialize: function (options, source) {
		L.setOptions(this, options);

		this._source = source;
		this._animated = L.Browser.any3d && this.options.zoomAnimation;
		this._isOpen = false;
	},

	_isOnMarker: function () {
		return this._source instanceof L.Marker || this._source instanceof L.CircleMarker;
	},

	onAdd: function (map) {
		this._map = map;

		this._pane = this._isOnMarker() ? map._panes.markerPane : map._panes.popupPane;

		if (!this._container) {
			this._initLayout();
		}

		this._pane.appendChild(this._container);

		this._initInteraction();

		this._update();

		this.setOpacity(this.options.opacity);

		map
			.on('moveend', this._onMoveEnd, this)
			.on('zoomstart', this._onZoomStart, this)
			.on('zoomend', this._onZoomEnd, this)
			.on('layeradd', this._onMarkerAdd, this)
			.on('viewreset', this._onViewReset, this);

		if (this._animated) {
			map.on('zoomanim', this._zoomAnimation, this);
		}

		if (L.Browser.touch && !this.options.noHide) {
			L.DomEvent.on(this._container, 'click', this.close, this);
		}
	},

	onRemove: function (map) {
		this._pane.removeChild(this._container);

		map.off({
			zoomanim: this._zoomAnimation,
			zoomend: this._onZoomEnd,
			zoomstart: this._onZoomStart,
			layeradd: this._onMarkerAdd,
			moveend: this._onMoveEnd,
			viewreset: this._onViewReset
		}, this);

		this._removeInteraction();

		this._map = null;
	},

	setLatLng: function (latlng) {
		this._latlng = L.latLng(latlng);
		if (this._map) {
			this._updatePosition();
		}
		return this;
	},

	setContent: function (content) {
		// Backup previous content and store new content
		this._previousContent = this._content;
		this._content = content;

		this._updateContent();

		return this;
	},

	close: function () {
		var map = this._map;

		if (map) {
			if (L.Browser.touch && !this.options.noHide) {
				L.DomEvent.off(this._container, 'click', this.close);
			}

			map.removeLayer(this);
		}
	},

	updateZIndex: function (zIndex) {
		this._zIndex = zIndex;

		if (this._container && this._zIndex) {
			this._container.style.zIndex = zIndex;
		}
	},

	setOpacity: function (opacity) {
		this.options.opacity = opacity;

		if (this._container) {
			L.DomUtil.setOpacity(this._container, opacity);
		}
	},

	_initLayout: function () {
		this._container = L.DomUtil.create('div', 'leaflet-label ' + this.options.className + ' leaflet-zoom-animated');
		this.updateZIndex(this._zIndex);
	},

	_update: function () {
		if (!this._map) { return; }

		this._container.style.visibility = 'hidden';

		this._updateContent();
		this._updatePosition();

		this._container.style.visibility = '';
	},

	_updateLabelDimensions: function () {
		this._labelWidth = this._container.offsetWidth;
		this._labelHeight = this._container.offsetHeight;
	},

	_updateContent: function () {
		if (!this._content || !this._map || this._prevContent === this._content) {
			return;
		}

		if (typeof this._content === 'string') {
			this._container.innerHTML = this._content;

			this._prevContent = this._content;

			this._updateLabelDimensions();
		}
	},

	_updatePosition: function () {
		var pos = this._map.latLngToLayerPoint(this._latlng);

		if (this._map._conflicts && !Object.keys(this._map._conflicts).length) {
			this._conflictsRetries = 2;
		}

		this._updateLabelDimensions();
		this._setPosition(pos);
		this._updateLabelBounds();
	},

	_updateLabelBounds: function () {
		if (this._map._labels) {
			var keys = Object.keys(this._map._labels);

			this._map._conflicts = {};

			for (var i = keys.length - 1; i >= 0; i--) {
				var label = this._map._labels[keys[i]];

				var bounds = this._getLabelBounds(label);

				for (var j = keys.length - 1; j >= 0; j--) {
					var otherLabel = this._map._labels[keys[j]];

					var otherBounds = this._getLabelBounds(otherLabel);

					if (i !== j && bounds.intersects(otherBounds)) {
						this._map._conflicts["" + keys[i] + ":" + keys[j]] = [keys[i], keys[j]];
					}
				}
			}

			if (Object.keys(this._map._conflicts).length) {
				if (this._conflictsRetries > 0) {
					this._updatePosition();
				}
			}
		}
	},

	_getLabelBounds: function (label) {
		var northEast = this._map.layerPointToLatLng(L.point(label._labelPos.x + label._labelWidth, label._labelPos.y + label._labelHeight)),
		southWest = this._map.layerPointToLatLng(L.point(label._labelPos.x, label._labelPos.y));
		var labelBounds = L.latLngBounds(southWest, northEast);
		
		return labelBounds;
	},

	_getIconHeight: function () {
		return this._source.options.icon ? this._source.options.icon.options.iconSize[1] : this._source.getRadius();
	},

	_setPosition: function (pos) {
		var map = this._map,
			container = this._container,
			centerPoint = map.latLngToContainerPoint(map.getCenter()),
			labelPoint = map.layerPointToContainerPoint(pos),
			direction = this._getDirection(),
			labelWidth = this._labelWidth,
			offset = L.point(this.options.offset),
			id = this._leaflet_id,
			verticalOffset;

		var setDirections = {
			top: function () {
				direction = 'top';
				verticalOffset = offset.y;
				verticalOffset -= this._isOnMarker() ? this._getIconHeight() : 0;
				verticalOffset -= this._labelHeight;
				
				pos = pos.add(L.point(-labelWidth / 2, verticalOffset));
			},
			bottom: function () {
				direction = 'bottom';
				verticalOffset = offset.y;
				verticalOffset += this._isOnMarker ? this._getIconHeight() : 0;

				pos = pos.add(L.point(-labelWidth / 2, verticalOffset));
			},
			right: function () {
				direction = 'right';
				pos = pos.add(offset);
			},
			left: function () {
				direction = 'left';
				pos = pos.add(L.point(-offset.x - labelWidth, offset.y));
			},
			auto: function () {
				if (labelPoint.x < centerPoint.x) {
					setDirections.right.apply(this);
				}
				else {
					setDirections.left.apply(this);
				}
			},
			verticalauto: function () {
				var distanceToCenter = Math.abs(labelPoint.y - centerPoint.y),
					threshold = 5,
					conflicts = this._map._conflicts ? Object.keys(this._map._conflicts) : [],
					ownConflicts = conflicts.filter(function (c) { return parseInt(c.split(":")[0], 10) === id; });

				if (labelPoint.y > centerPoint.y) {
					if (ownConflicts.length) {
						this._conflictsRetries--;
						setDirections.bottom.apply(this);
					}
					else {
						setDirections.top.apply(this);
					}

				}
				else {
					if (ownConflicts.length) {
						this._conflictsRetries--;
						setDirections.top.apply(this);
					}
					else {
						setDirections.bottom.apply(this);
					}
				}
			}
		};
	
		setDirections[direction].apply(this);

		this._setProperClass(pos, direction);
		this._labelPos = pos;
		L.DomUtil.setPosition(container, pos);
	},

	_generateLabelClass: function (direction) {
		return 'leaflet-label-' + direction;
	},

	_setProperClass: function (pos, direction) {
		var map = this._map,
			container = this._container,

			labelPoint = map.layerPointToContainerPoint(pos),
			centerPoint = map.latLngToContainerPoint(map.getCenter()),
			classToAdd = this._generateLabelClass(direction);

		direction = direction || this._getDirection();

		for (var i = 0; i < this._directions.length; i++) {
			var d = this._directions[i];
			if (d !== direction) {
				var classToRemove = this._generateLabelClass(d);
				L.DomUtil.removeClass(container, classToRemove);
			}
		}

		L.DomUtil.addClass(container, classToAdd);
	},

	_getDirection: function () {
		return this.options.direction;
	},

	_zoomAnimation: function (opt) {
		var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center).round();

		this._setPosition(pos);
	},

	_onMoveEnd: function () {
		if (!this._animated || this._getDirection() === 'auto' || this._getDirection() === 'verticalauto') {
			this._updatePosition();
		}
	},

	_onZoomStart: function (e) {
	
	},

	_onMarkerAdd: function (e) {
		if (e.layer instanceof L.Marker || e.layer instanceof L.CircleMarker) {
			var otherLabel = e.layer.label;

			this._map._labels = this._map._labels || {};

			if (otherLabel._leaflet_id && otherLabel._labelPos) {
				this._map._labels[otherLabel._leaflet_id] = otherLabel;
			}
		}

	},

	_onZoomEnd: function (e) {
		this._lastZoomLevel = this._zoomLevel;
		this._zoomLevel = e.target._zoom;

		L.DomUtil.removeClass(this._map._container, 'zoom-level-' + this._lastZoomLevel);
		L.DomUtil.addClass(this._map._container, 'zoom-level-' + this._zoomLevel);
		this._onMoveEnd();
	},

	_onViewReset: function (e) {
		/* if map resets hard, we must update the label */
		if (e && e.hard) {
			this._update();
		}
	},

	_initInteraction: function () {
		if (!this.options.clickable) { return; }

		var container = this._container,
			events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.addClass(container, 'leaflet-clickable');
		L.DomEvent.on(container, 'click', this._onMouseClick, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.on(container, events[i], this._fireMouseEvent, this);
		}
	},

	_removeInteraction: function () {
		if (!this.options.clickable) { return; }

		var container = this._container,
			events = ['dblclick', 'mousedown', 'mouseover', 'mouseout', 'contextmenu'];

		L.DomUtil.removeClass(container, 'leaflet-clickable');
		L.DomEvent.off(container, 'click', this._onMouseClick, this);

		for (var i = 0; i < events.length; i++) {
			L.DomEvent.off(container, events[i], this._fireMouseEvent, this);
		}
	},

	_onMouseClick: function (e) {
		if (this.hasEventListeners(e.type)) {
			L.DomEvent.stopPropagation(e);
		}

		this.fire(e.type, {
			originalEvent: e
		});
	},

	_fireMouseEvent: function (e) {
		this.fire(e.type, {
			originalEvent: e
		});

		// TODO proper custom event propagation
		// this line will always be called if marker is in a FeatureGroup
		if (e.type === 'contextmenu' && this.hasEventListeners(e.type)) {
			L.DomEvent.preventDefault(e);
		}
		if (e.type !== 'mousedown') {
			L.DomEvent.stopPropagation(e);
		} else {
			L.DomEvent.preventDefault(e);
		}
	}
});
