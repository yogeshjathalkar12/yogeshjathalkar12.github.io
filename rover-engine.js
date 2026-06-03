/**
 * Shoonya Origins Rover Automation Engine
 * Pathfinding, Spotlight & Static JSON Knowledge Base
 */

const RoverEngine = {
    // UI Elements
    bot: null, speechBubble: null, chatHistory: null,
    actionBtn: null, inputArea: null, userInput: null, sendBtn: null,
    curtain: null, sprite: null,

    // State
    currentStep: 0,
    isTourActive: false,
    knowledgeBase: [],

    // Tour Timeline
    timeline: [
        { target: 'hero-target',   text: "System initialized. Hello! I am your Shoonya Explorer.", btn: "Let's Go!" },
        { target: 'ecosystem',     text: "This is our primary multi-disciplinary grid. Zero standard wrappers.", btn: "Show Me Health" },
        { target: 'card-aura',     text: "Aura is our non-invasive medical intelligence portal.", btn: "Scan Infrastructure" },
        { target: 'card-construct',text: "CONSTRUCT operates autonomous heavy vehicular navigation systems.", btn: "Check Marketing AI" },
        { target: 'card-raptor',   text: "Raptor deploys automated target acquisition algorithms.", btn: "Review Updates" },
        { target: 'updates',       text: "Our core pipeline updates stream here.", btn: "Finish Tour" }
    ],

    init() {
        this.bot          = document.getElementById('rover-bot');
        this.speechBubble = document.getElementById('rover-speech');
        this.chatHistory  = document.getElementById('rover-chat-history');
        this.actionBtn    = document.getElementById('rover-action-btn');
        this.inputArea    = document.getElementById('rover-input-area');
        this.userInput    = document.getElementById('rover-user-input');
        this.sendBtn      = document.getElementById('rover-send-btn');
        this.curtain      = document.getElementById('tour-curtain');
        this.sprite       = document.getElementById('rover-sprite');

        // Abort gracefully if the rover UI isn't on this page
        if (!this.bot || !this.speechBubble || !this.actionBtn) return;

        // 1. Load JSON Knowledge Base
        fetch('knowledge.json')
            .then(res => {
                if (!res.ok) throw new Error('Network response was not ok');
                return res.json();
            })
            .then(data => {
                this.knowledgeBase = data;
                console.log('Shoonya Rover Memory Loaded:', data.length, 'records.');
            })
            .catch(err => console.warn('Could not load knowledge.json:', err));

        // 2. Bind Buttons
        this.actionBtn.addEventListener('click', () => this.next());
        this.sendBtn.addEventListener('click', () => this.handleChat());
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleChat();
        });

        // 3. Bind Card Interactions
        this.bindUserInteractions();

        // 4. Start the Tour after a short delay
        setTimeout(() => {
            this.isTourActive = true;
            if (this.curtain) this.curtain.classList.add('active');
            this.driveToElement('hero-target');
            this.speechBubble.classList.add('active');
        }, 1000);
    },

    appendMessage(text, sender) {
        if (!this.chatHistory) return;
        const p = document.createElement('p');
        p.className = sender === 'user' ? 'user-msg' : 'bot-msg';
        p.innerText = text;
        this.chatHistory.appendChild(p);
        this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
    },

    driveToElement(elementId) {
        const target = document.getElementById(elementId);
        if (!target || !this.bot) return;

        // Remove previous spotlight focus
        document.querySelectorAll('.tour-focus').forEach(el => el.classList.remove('tour-focus'));
        target.classList.add('tour-focus');
        if (this.curtain) this.curtain.classList.add('active');

        // Calculate destination coordinates
        const rect    = target.getBoundingClientRect();
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;

        let destY = rect.top + scrollY + (rect.height / 2) - 80;
        let destX = rect.left + scrollX - 180;

        // Clamp to left edge on narrow viewports
        if (destX < 10) destX = 20;

        this.bot.style.top  = `${destY}px`;
        this.bot.style.left = `${destX}px`;

        if (this.isTourActive) {
            window.scrollTo({ top: rect.top + scrollY - 150, behavior: 'smooth' });
        }
    },

    next() {
        this.currentStep++;
        if (this.chatHistory) this.chatHistory.innerHTML = '';

        if (this.currentStep < this.timeline.length) {
            const step = this.timeline[this.currentStep];
            this.driveToElement(step.target);
            this.appendMessage(step.text, 'bot');
            this.actionBtn.innerText = step.btn;
        } else {
            this.enableTwoWayMode();
        }
    },

    enableTwoWayMode() {
        this.isTourActive = false;

        if (this.curtain) this.curtain.classList.remove('active');
        document.querySelectorAll('.tour-focus').forEach(el => el.classList.remove('tour-focus'));

        this.actionBtn.style.display = 'none';
        if (this.inputArea) this.inputArea.style.display = 'flex';

        if (this.chatHistory) this.chatHistory.innerHTML = '';
        this.appendMessage("Tour complete! I'm online and ready. What would you like to know about our tools?", 'bot');
    },

    bindUserInteractions() {
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', () => {
                if (this.isTourActive) return;

                const titleEl = card.querySelector('.card-title');
                const title   = titleEl ? titleEl.innerText.toUpperCase() : 'THIS SECTOR';

                this.driveToElement(card.id);

                if (this.chatHistory) this.chatHistory.innerHTML = '';
                this.appendMessage(`You are looking at ${title}. Ask me anything about this framework below!`, 'bot');

                // Show close button while spotlight is active
                this.actionBtn.innerText = 'Close Spotlight';
                this.actionBtn.style.display = 'inline-block';
                if (this.inputArea) this.inputArea.style.display = 'flex';

                // Replace onclick so it only fires for this specific close action
                const closeHandler = () => {
                    if (this.curtain) this.curtain.classList.remove('active');
                    card.classList.remove('tour-focus');
                    this.actionBtn.style.display = 'none';
                    this.actionBtn.removeEventListener('click', closeHandler);
                    // Restore default next() listener
                    this.actionBtn.addEventListener('click', () => this.next());
                };

                // Temporarily override the action button listener
                this.actionBtn.replaceWith(this.actionBtn.cloneNode(true));
                this.actionBtn = document.getElementById('rover-action-btn');
                this.actionBtn.addEventListener('click', closeHandler);
            });
        });
    },

    // =========================================
    // TWO-WAY STATIC JSON SEARCH ENGINE
    // =========================================
    handleChat() {
        if (!this.userInput) return;
        const rawText = this.userInput.value.trim();
        const text    = rawText.toLowerCase();
        if (!text) return;

        this.appendMessage(rawText, 'user');
        this.userInput.value = '';

        // Thinking indicator
        const thinkingId = 'thinking-' + Date.now();
        const p = document.createElement('p');
        p.className = 'bot-msg';
        p.id = thinkingId;
        p.innerText = 'Scanning data files...';
        if (this.chatHistory) {
            this.chatHistory.appendChild(p);
            this.chatHistory.scrollTop = this.chatHistory.scrollHeight;
        }

        setTimeout(() => {
            const el = document.getElementById(thinkingId);
            if (el) el.remove();

            let finalReply = "I'm sorry, my current data files don't have information on that. Could you ask about Aura, Construct, or our tools?";
            let bestMatchCount = 0;

            this.knowledgeBase.forEach(record => {
                let matchCount = 0;
                record.tags.forEach(tag => {
                    if (text.includes(tag)) matchCount++;
                });
                if (matchCount > bestMatchCount) {
                    bestMatchCount = matchCount;
                    finalReply = record.response;
                }
            });

            this.appendMessage(finalReply, 'bot');

            // Dynamic navigation based on matched answer
            const navMap = {
                'Aura is our non-invasive': 'card-aura',
                'Raptor is our AI':         'card-raptor',
                'Shakti focuses':           'card-shakti',
                'Construct and Basis':      'card-construct',
                'Aether Labs':              'card-aether'
            };

            for (const [snippet, targetId] of Object.entries(navMap)) {
                if (finalReply.includes(snippet)) {
                    this.driveToElement(targetId);
                    break;
                }
            }
        }, 500);
    }
};

window.addEventListener('DOMContentLoaded', () => RoverEngine.init());