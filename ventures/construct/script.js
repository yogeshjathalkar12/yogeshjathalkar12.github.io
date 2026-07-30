AOS.init({ duration: 800, once: false, mirror: true });

        // 1. DYNAMIC SIDE PANEL LOGIC (Distance Sync)
        const detailTitle = document.getElementById('detail-title');
        const detailSpecs = document.getElementById('detail-specs');
        const cards = document.querySelectorAll('.module-card');
        const listItems = document.querySelectorAll('.sys-item');

        // Hover Effect
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                const title = card.querySelector('h3').innerText;
                const specsData = card.getAttribute('data-specs');
                detailTitle.innerText = title;
                detailSpecs.innerHTML = '';
                if (specsData) {
                    specsData.split('|').forEach(spec => {
                        const li = document.createElement('li');
                        li.innerText = spec;
                        detailSpecs.appendChild(li);
                    });
                }
            });
        });

        // 4. SIDEBAR TOGGLE (off-canvas, hidden by default — both states use image icons)
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sysMonitor = document.getElementById('sysMonitor');
        const sidebarBackdrop = document.getElementById('sidebarBackdrop');
        const hamburgerIcon = document.getElementById('hamburgerIcon');
        const toggleLabel = document.getElementById('toggleLabel');

        // Drop your own icon files here — same convention as Raptor's assets folder
        const MENU_ICON_SRC = 'favicon1.png';
        const CLOSE_ICON_SRC = 'favicon1.png';

        function setSidebarOpen(open) {
            sysMonitor.classList.toggle('sidebar-open', open);
            sidebarBackdrop.classList.toggle('visible', open);
            hamburgerIcon.src = open ? CLOSE_ICON_SRC : MENU_ICON_SRC;
            hamburgerIcon.alt = open ? 'Close menu' : 'Open menu';
            toggleLabel.textContent = open ? 'Close' : '';
        }

        sidebarToggle.addEventListener('click', () => {
            setSidebarOpen(!sysMonitor.classList.contains('sidebar-open'));
        });
        sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
        listItems.forEach(li => li.addEventListener('click', () => setSidebarOpen(false)));

        function scrollToId(id) {
            document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        window.addEventListener('scroll', () => {
            const wrappers = document.querySelectorAll('.card-wrapper, .intro-section, .cta-final');
            let current = '';
            let minDistance = Infinity;
            const viewportCenter = window.scrollY + window.innerHeight / 2;

            wrappers.forEach(wrapper => {
                const rect = wrapper.getBoundingClientRect();
                const wrapperCenter = window.scrollY + rect.top + (rect.height / 2);
                const distance = Math.abs(viewportCenter - wrapperCenter);

                if (distance < minDistance && distance < window.innerHeight * 0.6) {
                    minDistance = distance;
                    current = wrapper.getAttribute('id');
                }
            });

            listItems.forEach(li => {
                li.classList.remove('active');
                if(li.getAttribute('onclick').includes(current)) {
                    li.classList.add('active');
                    if(current) {
                        const targetElement = document.getElementById(current);
                        const targetCard = targetElement.querySelector('.module-card');
                        
                        if (targetCard) {
                            const title = targetCard.querySelector('h3').innerText;
                            const specsData = targetCard.getAttribute('data-specs');
                            
                            detailTitle.innerText = title;
                            detailSpecs.innerHTML = '';
                            if (specsData) {
                                specsData.split('|').forEach(spec => {
                                    const li = document.createElement('li');
                                    li.innerText = spec;
                                    detailSpecs.appendChild(li);
                                });
                            }
                        } else {
                            detailTitle.innerText = targetElement.querySelector('h2')?.innerText || 'SYSTEM ACTIVE';
                            detailSpecs.innerHTML = '<li>New section loaded</li>';
                        }
                    }
                }
            });
        });

        // 2. THEME TOGGLE
        const switchElement = document.getElementById('lightSwitch');
        const body = document.body;
        let isAnimating = false;

        switchElement.addEventListener('click', () => {
            if (isAnimating) return;
            isAnimating = true;
            switchElement.classList.add('pulled');
            setTimeout(() => {
                body.classList.toggle('dark-mode');
                switchElement.classList.remove('pulled');
                isAnimating = false;
            }, 250);
        });

        // 3. GAME LOGIC: ADVANCED PHYSICS
        const gameTrigger = document.getElementById('gameTrigger');
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const gameOverlay = document.getElementById('gameOverlay');
        const startBtn = document.getElementById('startGameBtn');
        const scoreEl = document.getElementById('scoreVal');
        const healthEl = document.getElementById('healthVal');

        let clickCount = 0;
        let clickTimer;
        let gameActive = false;
        let animId;
        let drone = { x: 0, y: 0, angle: 0 };
        let targets = []; 
        let score = 0;
        let health = 100;
        let spawnTimer = 0;
        
        gameTrigger.addEventListener('click', () => {
            clickCount++;
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => { clickCount = 0; }, 500);
            if(clickCount >= 5) openGame();
        });

        function openGame() {
            body.classList.add('active-game');
            gameOverlay.style.display = 'block';
            resize();
        }

        startBtn.addEventListener('click', () => {
            gameOverlay.style.display = 'none';
            resetGame();
            gameActive = true;
            loop();
        });

        function resetGame() {
            drone.x = canvas.width / 2;
            drone.y = canvas.height / 2;
            targets = [];
            score = 0;
            health = 100;
            spawnTimer = 0;
            scoreEl.innerText = "0";
            healthEl.innerText = "100";
        }

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resize);

        window.addEventListener('mousemove', e => {
            drone.x = e.clientX;
            drone.y = e.clientY;
        });

        // ASSET DRAWING
        function drawDrone(x, y) {
            ctx.save();
            ctx.translate(x, y);
            drone.angle += 0.5;
            
            // X-Frame
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-20, -20); ctx.lineTo(20, 20);
            ctx.moveTo(20, -20); ctx.lineTo(-20, 20);
            ctx.stroke();

            // Central Hub
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();

            // LED Lights
            ctx.fillStyle = (Date.now() % 500 < 250) ? 'red' : '#333';
            ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI*2); ctx.fill();

            // Rotors
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            const positions = [[-20, -20], [20, -20], [-20, 20], [20, 20]];
            positions.forEach(pos => {
                ctx.beginPath();
                ctx.arc(pos[0], pos[1], 12 + Math.sin(drone.angle * 2)*3, 0, Math.PI*2);
                ctx.fill();
            });
            ctx.restore();
        }

        function drawCrack(x, y, life) {
            ctx.save();
            ctx.translate(x, y);
            ctx.strokeStyle = `rgba(239, 68, 68, ${life/100})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            // Jagged line
            ctx.moveTo(-15, -15);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-10, 5);
            ctx.lineTo(5, 0);
            ctx.lineTo(15, 15);
            ctx.stroke();
            ctx.restore();
        }

        function drawDebris(x, y, life) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = `rgba(245, 158, 11, ${life/100})`;
            // Random pile of rubble
            ctx.beginPath();
            ctx.moveTo(-10, 10);
            ctx.lineTo(-5, -5);
            ctx.lineTo(0, 5);
            ctx.lineTo(5, -10);
            ctx.lineTo(10, 10);
            ctx.fill();
            ctx.restore();
        }

        function loop() {
            if(!gameActive) return;
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0,0, canvas.width, canvas.height);
            
            // Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            for(let i=0; i<canvas.width; i+=50) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,canvas.height); ctx.stroke(); }
            for(let i=0; i<canvas.height; i+=50) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(canvas.width,i); ctx.stroke(); }

            spawnTimer++;
            if(spawnTimer > 50) { 
                let type = Math.random() > 0.5 ? 'damage' : 'waste';
                targets.push({
                    x: Math.random() * (canvas.width - 60) + 30,
                    y: Math.random() * (canvas.height - 60) + 30,
                    type: type,
                    life: 100, 
                    age: 0     
                });
                spawnTimer = 0;
            }

            // Loop Targets
            for(let i = targets.length - 1; i >= 0; i--) {
                let t = targets[i];
                t.age++;
                
                // Decay
                if(t.age > 400) {
                    health -= 10; healthEl.innerText = health;
                    targets.splice(i, 1); continue;
                }
                
                // MULTI-TARGET INTERACTION
                let dist = Math.hypot(drone.x - t.x, drone.y - t.y);
                if(dist < 200) { 
                    t.life -= 2;
                    // Laser Beam
                    ctx.beginPath(); 
                    ctx.moveTo(drone.x, drone.y); 
                    ctx.lineTo(t.x, t.y);
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)'; 
                    ctx.lineWidth = 2; 
                    ctx.stroke();
                    
                    // Hit Effect
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(t.x, t.y, 3, 0, Math.PI*2); ctx.fill();
                }
                
                if(t.life <= 0) {
                    score += 500; scoreEl.innerText = score.toLocaleString();
                    targets.splice(i, 1); continue;
                }

                if(t.type === 'damage') { drawCrack(t.x, t.y, t.life); } else { drawDebris(t.x, t.y, t.life); }
                
                // Health Bar
                ctx.fillStyle = 'white'; ctx.fillRect(t.x - 15, t.y - 20, 30 * (t.life/100), 3);
            }

            drawDrone(drone.x, drone.y);
            
            if(health <= 0) { gameOver(); return; }
            animId = requestAnimationFrame(loop);
        }

        function gameOver() {
            gameActive = false;
            cancelAnimationFrame(animId);
            gameOverlay.innerHTML = "<h2 style='color:red'>SITE CRITICAL</h2><button onclick='location.reload()' style='margin-top:20px; padding:10px;'>REBOOT SYSTEM</button>";
            gameOverlay.style.display = 'block';
        }

        window.addEventListener('keydown', e => {
            if(e.key === 'Escape' && body.classList.contains('active-game')) {
                location.reload();
            }
        });

    // Construct Launch Countdown
(function() {
    const target = new Date('2026-03-27T14:00:00+05:30').getTime();
    function pad(n) { return String(n).padStart(2, '0'); }
    function flip(el, val) {
        if (el.textContent !== val) {
            el.classList.remove('flip');
            void el.offsetWidth;
            el.classList.add('flip');
            el.textContent = val;
        }
    }
    function tick() {
        const diff = target - Date.now();
        if (diff <= 0) return;
        flip(document.getElementById('cl-days'),    pad(Math.floor(diff / 86400000)));
        flip(document.getElementById('cl-hours'),   pad(Math.floor((diff % 86400000) / 3600000)));
        flip(document.getElementById('cl-minutes'), pad(Math.floor((diff % 3600000) / 60000)));
        flip(document.getElementById('cl-seconds'), pad(Math.floor((diff % 60000) / 1000)));
    }
    tick();
    setInterval(tick, 1000);
})();
