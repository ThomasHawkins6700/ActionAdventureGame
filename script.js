/**
 * Core Adventure Game Engine
 * Manages game state, JSON loading, and navigation.
 */
/**
 * Core Adventure Game Engine
 */
class AdventureGame {
    constructor() {
        this.storyData = null;
        this.surprisePool = null; 
        this.miniGamePool = null;
        this.isButtonBound = false;

        this.state = { 
            currentStoryFile: './assets/mainScreen.json', 
            currentScene: 'game_title_screen', 
            inventory: [] 
        };

        this.miniGameEngine = new MiniGameEngine(this);
    }

    async loadStoryFile(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            this.storyData = await response.json();
            this.state.currentStoryFile = filePath;
        } catch (error) {
            console.error("Error loading story file:", error);
            this.storyData = null;
        }
    }

 async loadAssetsPools() {
    console.log("🔍 DEBUG: Full MiniGame Pool Loaded:", JSON.stringify(this.game.miniGamePool, null, 2));
    // 1. Get the current path (e.g., /ActionAdventureGame/index.html)
    // 2. We extract the base directory to ensure we always point to the project root
    const pathParts = window.location.pathname.split('/');
    const repoName = pathParts[1]; // This captures 'ActionAdventureGame'
    const baseUrl = `/${repoName}`;

    // Now we build the path using the detected base
    const miniGamesPath = `${baseUrl}/assets/miniGames.json`;
    const surprisesPath = `${baseUrl}/assets/surprises.json`;

    try {
        const [miniGamesRes, surprisesRes] = await Promise.all([
            fetch(miniGamesPath),
            fetch(surprisesPath)
        ]);

        if (!miniGamesRes.ok || !surprisesRes.ok) {
            throw new Error(`Failed to load: ${miniGamesRes.status}`);
        }

        this.miniGamePool = await miniGamesRes.json();
        this.surprisePool = await surprisesRes.json();
        
        console.log("Assets loaded! Path used:", miniGamesPath);
    } catch (error) {
        console.error("Critical Failure:", error);
    }
}
   async initGame() {
        this.loadGame();
        
        // Explicitly define the path for the initial hub
        const hubPath = "./assets/mainScreen.json";
        
        await this.loadStoryFile(hubPath);
        
        // SAFETY CHECK: If it's still null, stop here to avoid the crash
        if (!this.storyData) {
            console.error("Critical Failure: Could not load hub file at", hubPath);
            return;
        }

        await this.loadAssetsPools();
        
        if (!this.isButtonBound) {
            document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
            this.isButtonBound = true;
        }
        
        this.handleSceneTransition('game_title_screen');
    }
    // Unified Roll Logic
    rollForSurprise(node) {
        if (!this.surprisePool || this.surprisePool.length === 0) {
            console.error("❌ ERROR: Surprise Pool is empty!");
            return null;
        }

        let pool = this.surprisePool;
        
        // 1. Filter and clean the pool
        if (node && node.allowedSurpriseEffects) {
            const uniqueAllowed = [...new Set(node.allowedSurpriseEffects)];            
            
            const tempPool = this.surprisePool.filter(s => uniqueAllowed.includes(s.effect));
                        
            pool = [...new Map(tempPool.map(item => [item.effect, item])).values()];
            
            console.log(`🎲 Filtered pool to ${pool.length} UNIQUE candidates.`);
        }

        if (pool.length === 0) return null;

        // 2. Perform the roll (e.g., 12 or higher for a surprise)
        const d20Roll = Math.floor(Math.random() * 20) + 1;
        console.log(`🎲 Systems Check: Rolled a ${d20Roll}`);

        if (d20Roll >= 12) { 
            const randomIndex = Math.floor(Math.random() * pool.length);
            const selected = pool[randomIndex];
            console.log("✅ Surprise triggered:", selected.effect);
            return selected;
        }
        
        return null; 
    }

    // AdventureGame.js
    render(node = null) {
        if (!node) node = this.storyData[this.state.currentScene];
        
        // 1. Update UI elements
        document.getElementById('game-title').innerText = node.title || "Adventure Quest";
        document.getElementById('story-text').innerText = node.text || "";
        
        // 2. Clear and rebuild buttons
        const buttonContainer = document.getElementById('choices-container');
        buttonContainer.innerHTML = '';
        
        // Ensure node.options exists before looping
        (node.options || []).forEach(option => {
            const button = document.createElement('button');
            button.innerText = option.text;
            button.className = 'choice-btn';
            // ONLY call makeChoice here
            button.addEventListener('click', () => this.makeChoice(option));
            buttonContainer.appendChild(button);
        });
        // REMOVE any call to handleSceneTransition here!
    }

    // Single source of truth for scene movement
    handleSceneTransition(sceneId) {
        this.state.currentScene = sceneId;
        this.saveGame();
        
        const node = this.storyData[sceneId];
        if (!node) {
            console.error("❌ Node not found:", sceneId);
            return;
        }

        // 1. Process Surprise once
        if (node.surprise === true) {
            const surprise = this.rollForSurprise(node);
            
            if (surprise) {
                // Difficulty Roll
                let difficulty = 1;
                if (Array.isArray(node.surpriseDifficultyRange)) {
                    const [min, max] = node.surpriseDifficultyRange;
                    difficulty = Math.floor(Math.random() * (max - min + 1)) + min;
                    console.log(`🎲 Difficulty Roll: [${min}, ${max}] = ${difficulty}`);
                }
                
                // Only trigger engine if we have a valid miniGameId
                if (surprise.miniGameId) {
                    this.miniGameEngine.start(surprise.miniGameId, difficulty);
                }
            } else {
                console.log("🎲 Dice rolled, no surprise triggered.");
            }
        }

        // 2. Render the scene
        this.render(node);
    }

    async makeChoice(option) {
        console.log("👉 Button clicked: navigating to", option.nextScene);
        if (option.storyFile) {
            await this.loadStoryFile(option.storyFile);
        }
        // This calls the "Brain" that rolls the dice
        this.handleSceneTransition(option.nextScene);
    }

    jumpToScene(sceneId) {
        console.log("🚀 Jumping to:", sceneId);
        
        // Force hide modals before jumping
        document.getElementById('minigame-modal').style.display = 'none';
        
        // Use a tiny delay to allow the browser to repaint
        setTimeout(() => {
            this.handleSceneTransition(sceneId);
        }, 100);
    }

    saveGame() { localStorage.setItem('adventure_game_save', JSON.stringify(this.state)); }

    loadGame() {
        const savedProgress = localStorage.getItem('adventure_game_save');
        if (savedProgress) {
            try { this.state = JSON.parse(savedProgress); } catch (e) { this.resetGame(); }
        }
    }

    resetGame() {
        this.state = { currentStoryFile: './assets/mainScreen.json', currentScene: 'game_title_screen', inventory: [] };
        this.saveGame();
        this.initGame(); 
    }
}

/**
 * Modular mini-Game Engine
 * Routes and handles puzzle-specific micro-logic states.
 */

class MiniGameEngine {
    constructor(gameInstance) {
        this.game = gameInstance;
        this.currentPuzzle = null;
        this.playerSequence = [];
        this.timer = null;
        this.isGameActive = false;

        // FIX: Ensure puzzleRegistry is attached to the instance using 'this.'
        this.puzzleRegistry = {
            "sequence_lock": () => this.initRunePuzzle(),
            "trivia_quiz": () => this.initTriviaPuzzle(),
            "dot_tap": () => this.initDotTapPuzzle()
        };
    }

    start(gameId, difficultyTier) {
        this.isGameActive = true;
        this.currentPuzzle = null;
        this.playerSequence = [];
        if (this.timer) clearInterval(this.timer);

        // 2. Validate
        if (!this.game.miniGamePool) return;
        const puzzleData = this.game.miniGamePool.find(g => g.id === gameId);
        if (!puzzleData) {
            console.error(`mini-game with ID "${gameId}" not found.`);
            return;
        }

        // 3. Mapping
        this.currentPuzzle = { ...puzzleData };
        const dotMap = { 1: 3, 2: 5, 3: 7 };
        this.currentPuzzle.level = dotMap[difficultyTier] || 3;

        console.log(`🎮 Engine: Starting ${gameId}. Type: ${this.currentPuzzle.type}`);

        // 4. UI Setup
        document.getElementById('minigame-modal').style.display = 'flex';
        document.getElementById('minigame-header').innerText = this.currentPuzzle.title;
        
        const duration = this.currentPuzzle.timeLimit || 10;
        this.startTimer(duration);

        // 5. ROUTER: Correctly using 'this.puzzleRegistry'
        if (this.puzzleRegistry[this.currentPuzzle.type]) {
            this.puzzleRegistry[this.currentPuzzle.type]();
        } else {
            console.error(`Unknown puzzle type: ${this.currentPuzzle.type}`);
        }
    }
    /**
     * Manages the "Evil" timer and visual progress bar
     */
    startTimer(seconds) {
        const fill = document.getElementById('progress-bar-fill');
        let timeLeft = seconds;
        
        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            timeLeft -= 0.1;
            const percent = (timeLeft / seconds) * 100;
            fill.style.width = `${percent}%`;

            if (timeLeft <= 0) {
                clearInterval(this.timer);
                this.endMiniGame(false); // Time's up = automatic fail
            }
        }, 100);
    }

    // ==========================================
    // MODULE 1: RUNIC SEQUENCE PUZZLE LOGIC
    // ==========================================
    
    initRunePuzzle() {
        document.getElementById('minigame-display').innerText = "Current Sequence: 🔒";
        const buttonsContainer = document.getElementById('minigame-buttons');
        buttonsContainer.innerHTML = '';
        
        const shuffledOptions = [...this.currentPuzzle.sequence].sort(() => Math.random() - 0.5);
        
        shuffledOptions.forEach(symbol => {
            const btn = document.createElement('button');
            btn.innerText = symbol;
            btn.className = 'rune-btn';
            btn.addEventListener('click', () => this.handleRuneInput(symbol));
            buttonsContainer.appendChild(btn);
        });
    }

    handleRuneInput(symbol) {
        this.playerSequence.push(symbol);
        document.getElementById('minigame-display').innerText = `Sequence: ${this.playerSequence.join(' ')}`;

        if (this.playerSequence.length === this.currentPuzzle.sequence.length) {
            const isCorrect = this.playerSequence.every((val, index) => val === this.currentPuzzle.sequence[index]);
            this.endMiniGame(isCorrect);
        }
    }

    // ==========================================
    // MODULE 2: TRIVIA / RIDDLE PUZZLE LOGIC
    // ==========================================
    
    initTriviaPuzzle() {
        // 1. Pick a random question from the pool
        const questions = this.currentPuzzle.questions;
        const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
        
        // 2. Save this question to the instance so we can check it later
        this.activeQuestion = randomQuestion;
        
        // 3. Update the UI
        document.getElementById('minigame-clue').innerText = this.activeQuestion.clue;
        
        const choicesContainer = document.getElementById('minigame-buttons');
        choicesContainer.innerHTML = '';
        
        this.activeQuestion.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.innerText = choice;
            btn.className = 'trivia-btn';
            btn.addEventListener('click', () => this.checkTriviaAnswer(choice));
            choicesContainer.appendChild(btn);
        });
    }

    checkTriviaAnswer(selectedAnswer) {
        if (selectedAnswer === this.activeQuestion.answer) {
            this.endMiniGame(true); // Success logic
        } else {
            this.endMiniGame(false); // Fail logic
        }
    }

    // ==========================================
    // MODULE 3: SPEED TAPPING
    // ==========================================
    
   initDotTapPuzzle() {
        const numDots = this.currentPuzzle.level; 
        const buttonsContainer = document.getElementById('minigame-buttons');
        buttonsContainer.innerHTML = '';
        
        const gridSize = Math.ceil(Math.sqrt(numDots));
        const step = 70 / (gridSize - 1 || 1);
        
        const slots = [];
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                slots.push({ top: 15 + (r * step), left: 15 + (c * step) });
            }
        }
        slots.sort(() => Math.random() - 0.5);

        const sequence = Array.from({ length: numDots }, (_, i) => i + 1);
        
        sequence.forEach((num, index) => {
            const btn = document.createElement('button');
            btn.innerText = num;
            btn.className = 'dot-btn';
            
            // --- RANDOM SIZE LOGIC ---
            // Random size between 40px and 70px
            const randomSize = Math.floor(Math.random() * 30) + 40;
            btn.style.width = `${randomSize}px`;
            btn.style.height = `${randomSize}px`;
            btn.style.fontSize = `${randomSize * 0.4}px`; // Scale font with button
            // -------------------------

            const slot = slots[index];
            btn.style.position = 'absolute';
            btn.style.top = `${slot.top}%`;
            btn.style.left = `${slot.left}%`;
            
            btn.addEventListener('click', () => this.handleDotTap(num, btn));
            buttonsContainer.appendChild(btn);
        });
    }

    handleDotTap(num, btn) {
        const nextExpected = this.playerSequence.length + 1;
        
        if (num === nextExpected) {
            btn.style.backgroundColor = '#10b981';
            btn.disabled = true;
            this.playerSequence.push(num);
            
            // Use the level property instead of hardcoding a sequence length
            if (this.playerSequence.length === this.currentPuzzle.level) {
                this.endMiniGame(true);
            }
        } else {
            this.endMiniGame(false);
        }
    }

    /**
     * Clean Closing Sequence with Scenario Branching
     */
    endMiniGame(isCorrect) {
        if (!this.isGameActive) return; 
        this.isGameActive = false;      

        // Stop the timer immediately
        clearInterval(this.timer);

        // Determine outcome destination
        const nextSceneId = isCorrect ? this.currentPuzzle.successScene : this.currentPuzzle.failScene;

        setTimeout(() => {
            alert(isCorrect ? this.currentPuzzle.successText : this.currentPuzzle.failText);
            
            // Close modal
            document.getElementById('minigame-modal').style.display = 'none';

            // Branch to next location
            if (nextSceneId) {
                this.game.jumpToScene(nextSceneId);
            }
        }, 300);
    }
}

// Global initialization hook
const game = new AdventureGame();
window.onload = () => game.initGame();