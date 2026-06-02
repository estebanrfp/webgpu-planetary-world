/**
 * createCockpitUI
 * Handles the first-person dashboard overlay and flight instrument visuals.
 * @returns {Object} CockpitUI instance
 */
export const createCockpitUI = () => {
    const container = document.createElement('div');
    container.id = 'cockpit-overlay';
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        display: none;
        z-index: 100;
        background: radial-gradient(circle at center, transparent 40%, rgba(0, 20, 40, 0.4) 100%);
    `;

    let speedGauge = null;

    const _createPanel = (title, lines) => {
        const div = document.createElement('div');
        div.style.cssText = `
            color: #5af;
            font-family: 'Inter', sans-serif;
            font-size: 10px;
            letter-spacing: 1px;
            text-shadow: 0 0 10px rgba(80, 180, 255, 0.5);
        `;
        const h = document.createElement('div');
        h.innerText = title;
        h.style.fontWeight = 'bold';
        h.style.marginBottom = '5px';
        h.style.borderBottom = '1px solid #5af';
        div.appendChild(h);

        lines.forEach(text => {
            const p = document.createElement('div');
            p.innerText = text;
            div.appendChild(p);
        });
        return div;
    };

    const _createGauge = (title, initialValue) => {
        const div = document.createElement('div');
        div.style.cssText = `
            color: #fff;
            text-align: center;
            font-family: 'Inter', sans-serif;
        `;
        const t = document.createElement('div');
        t.innerText = title;
        t.style.fontSize = '12px';
        t.style.color = '#5af';
        const v = document.createElement('div');
        v.className = 'gauge-value';
        v.innerText = initialValue;
        v.style.fontSize = '32px';
        v.style.fontWeight = 'bold';
        v.style.textShadow = '0 0 20px rgba(255, 255, 255, 0.5)';
        
        div.appendChild(t);
        div.appendChild(v);
        return div;
    };

    const _initElements = () => {
        // Dashboard Frame
        const frame = document.createElement('div');
        frame.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100vw;
            height: 25vh;
            pointer-events: none;
            display: flex;
            justify-content: space-around;
            align-items: flex-end;
            padding: 0 40px 40px 40px;
        `;

        // Left Instrument cluster
        const leftPanel = _createPanel('SYSTEMS', ['FUEL: OK', 'TEMP: 320K', 'CORE: STABLE']);
        // Center Instrument cluster (Speed)
        speedGauge = _createGauge('VELOCITY', '0.00 km/s');
        // Right Instrument cluster
        const rightPanel = _createPanel('NAVIGATION', ['ALT: 0.5km', 'ZONE: G-01', 'ORBIT: N/A']);

        frame.appendChild(leftPanel);
        frame.appendChild(speedGauge);
        frame.appendChild(rightPanel);
        container.appendChild(frame);

        // HUD Reticle
        const reticle = document.createElement('div');
        reticle.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 60px;
            height: 60px;
            border: 2px solid rgba(100, 200, 255, 0.6);
            border-radius: 50%;
            transform: translate(-50%, -50%);
        `;
        const dot = document.createElement('div');
        dot.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 4px;
            height: 4px;
            background: #5af;
            border-radius: 50%;
            transform: translate(-50%, -50%);
        `;
        reticle.appendChild(dot);
        container.appendChild(reticle);
    };

    // Initialize elements
    _initElements();
    document.body.appendChild(container);

    const show = () => {
        container.style.display = 'block';
    };

    const hide = () => {
        container.style.display = 'none';
    };

    const update = (velocity) => {
        if (container.style.display === 'none') return;
        const valElem = speedGauge.querySelector('.gauge-value');
        if (valElem) {
            valElem.innerText = `${velocity.toFixed(2)} km/s`;
        }
    };

    return {
        show,
        hide,
        update
    };
};
