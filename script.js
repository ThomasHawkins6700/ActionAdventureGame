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
        };
        this.player = new Player("Ashton");
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
    const miniGamesRes = await fetch(`./assets/miniGames.json?t=${Date.now()}`);
    this.miniGamePool = await miniGamesRes.json();
    
    console.log("✅ New Pool Loaded:", this.miniGamePool);
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
        // 1. Only roll if the node actually has a surprise defined
        if (!node.surprise) return null;

        // 2. Perform the roll
        const d20Roll = Math.floor(Math.random() * 20) + 1;
        if (d20Roll < 12) return null; // Or use node.surpriseChance

        // 3. Return a standard "Surprise Object"
        // We pull the ID directly from the node or a default
        return {
            miniGameId: node.surpriseMiniGameId, 
            onSuccess: node.onSurpriseSuccess,
            onFailure: node.onSurpriseFailure
        };
    }

    // AdventureGame.js
    render(node = null) {
        if (!node) node = this.storyData[this.state.currentScene];
        
        // Clear existing timer and reset UI
        if (this.sceneTimer) clearTimeout(this.sceneTimer);
        const container = document.getElementById('game-container');
        const timerBar = document.getElementById('timer-bar-bg');
        const timerFill = document.getElementById('timer-bar-fill');

        // Handle Timed Scene
        if (node.timer) {
            container.classList.add('timed-scene');
            timerBar.style.display = 'block';
            
            // Setup transition
            timerFill.style.transition = `width ${node.timer}s linear`;
            timerFill.style.width = '100%';
            
            // Trigger shrink (delayed slightly so the CSS transition kicks in)
            requestAnimationFrame(() => {
                timerFill.style.width = '0%';
            });

            this.sceneTimer = setTimeout(() => {
                this.handleSceneTransition(node.timeoutScene);
            }, node.timer * 1000);
        } else {
            container.classList.remove('timed-scene');
            timerBar.style.display = 'none';
        }

        // Update Text and Buttons (as before)
        document.getElementById('game-title').innerText = node.title || "Adventure Quest";
        const storyDiv = document.getElementById('story-text');
        
        // 1. Clear the div
        storyDiv.innerHTML = "";

        // 2. Create a temporary container to "wash" the string
        const parser = new DOMParser();
        const doc = parser.parseFromString(node.text, 'text/html');
        
        // 3. Move the parsed content into your storyDiv
        while (doc.body.firstChild) {
            storyDiv.appendChild(doc.body.firstChild);
        }
        
        // 3. Clear and Rebuild Buttons
        const buttonContainer = document.getElementById('choices-container');
        buttonContainer.innerHTML = '';
        
        (node.options || []).forEach(option => {
            // --- ADDED: Requirement Logic ---
            if (option.requiredItem) {
                // If player doesn't have the item, skip creating this button
                if (!this.player.inventory.includes(option.requiredItem)) {
                    return; 
                }
            }
            // --------------------------------

            const button = document.createElement('button');
            button.innerText = option.text;
            button.className = 'choice-btn';
            button.addEventListener('click', () => this.makeChoice(option));
            buttonContainer.appendChild(button);
        });
    }

    // Single source of truth for scene movement
    handleSceneTransition(sceneId) {
        const node = this.storyData[sceneId];
        if (!node) return console.error("❌ Node not found:", sceneId);

        this.state.currentScene = sceneId;
        this.saveGame();

        // 1. Check for Surprise
        if (node.surprise === true) {
            const surprise = this.rollForSurprise(node);
            
            if (surprise) {
                // Logic for SURPRISE B
                let difficulty = 1;
                if (Array.isArray(node.surpriseDifficultyRange)) {
                    const [min, max] = node.surpriseDifficultyRange;
                    difficulty = Math.floor(Math.random() * (max - min + 1)) + min;
                }

                // We hide the standard content temporarily
                this.render(node, { hideContent: true }); 

                this.miniGameEngine.start(surprise.miniGameId, difficulty, (isSuccess) => {
                    // Now we navigate to the outcome, NOT the node itself
                    const nextScene = isSuccess ? node.onSurpriseSuccess : node.onSurpriseFailure;
                    this.handleSceneTransition(nextScene);
                });
                return; // EXIT: We don't render the default node yet
            }
        }

        // 2. Logic for SAFE B (Default path)
        this.render(node);
    }

    async makeChoice(option) {
        console.log("👉 Button clicked");

        // 1. Handle Item/Energy (Always do this first)
        if (option.item) {
            const success = this.player.addItem(option.item);
            if (success) {
                this.renderHUD(); // Update UI here
                this.saveGame();  // Save here
            }
        }
        if (option.energyCost > 0) this.player.modifyEnergy(-option.energyCost);
        this.renderHUD();

        // 2. Load story file if needed
        if (option.storyFile) {
            await this.loadStoryFile(option.storyFile);
        }

        // 3. THE UNIFIED MINI-GAME / TRANSITION LOGIC
        // We treat miniGame and triggerMiniGame as the same goal
        const miniGameConfig = option.miniGame || option.triggerMiniGame;

        if (miniGameConfig) {
            // Normalize: if it's just a string ID, wrap it in an object
            const config = typeof miniGameConfig === 'string' ? { id: miniGameConfig } : miniGameConfig;

            this.miniGameEngine.start(config, (isSuccess) => {
                // A. Consumption Logic
                const policy = config.consumptionPolicy;
                const itemToConsume = option.requiredItem; // Your JSON defines this
                
                let shouldConsume = false;
                if (policy === "always") shouldConsume = true;
                else if (policy === "success" && isSuccess) shouldConsume = true;
                else if (policy === "failure" && !isSuccess) shouldConsume = true;

                if (shouldConsume && itemToConsume) {
                    this.player.removeItem(itemToConsume);
                    this.renderHUD();
                }

                // B. Navigation Logic
                // Prioritize: Success/Fail paths > nextScene > default
                const nextScene = isSuccess 
                    ? (config.onSuccess || option.nextScene) 
                    : (config.onFailure || option.failScene || "chamber_dungeon");

                this.handleSceneTransition(nextScene);
            });
        } 
        // 4. Standard Transition
        else {
            this.handleSceneTransition(option.nextScene);
        }
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
    
    renderHUD() {
        // Update Energy
        const energyVal = document.getElementById('energy-val');
        if (energyVal) energyVal.innerText = this.player.energy;

        // Update inventory - Single Source of Truth
        const invList = document.getElementById('inventory-list');
        if (invList) {
            // We use the player's internal inventory array directly
            invList.innerHTML = this.player.inventory
                .map(item => `<li>${item}</li>`)
                .join('');
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
            "dot_tap": () => this.initDotTapPuzzle(),
            "discretion_check": () => this.initDiscretionCheck()
        };
    }

    start(gameConfig, difficultyTier, onComplete) {
        // 1. Detect if we are getting a new-style config object or legacy ID string
        let gameId = gameConfig;
        let config = {};

        if (typeof gameConfig === 'object') {
            gameId = gameConfig.id;
            config = gameConfig;
            onComplete = difficultyTier; 
        }

        // --- CRITICAL INITIALIZATION (The lines you noted were missing) ---
        this.isGameActive = true;
        this.currentPuzzle = null;
        this.playerSequence = [];
        if (this.timer) clearInterval(this.timer);
        
        // 2. Validate Pool
        if (!this.game.miniGamePool) return;
        
        const puzzleData = this.game.miniGamePool.find(g => g.id === gameId);
        if (!puzzleData) {
            console.error(`mini-game with ID "${gameId}" not found.`);
            return;
        }

        // 3. Setup consumption-aware callback
        this.onComplete = (result) => {
            const policy = config.consumptionPolicy || "none";
            const item = config.requiredItem;

            if (item && policy !== "none") {
                const shouldConsume = (policy === "both") || 
                                    (policy === "success" && result) || 
                                    (policy === "failure" && !result);

                if (shouldConsume) {
                    this.game.player.removeItem(item);
                    this.game.renderHUD();
                }
            }
            if (onComplete) onComplete(result);
        };

        // 4. Merge base data with specific config
        this.currentPuzzle = { 
            ...puzzleData, 
            ...config,
            description: config.descriptionOverride || puzzleData.description,
            successText: config.successTextOverride || puzzleData.successText,
            failText: config.failTextOverride || puzzleData.failText,
        };
        
        // 5. UI Setup
        const headerEl = document.getElementById('minigame-header');
        const clueEl = document.getElementById('minigame-clue');
        const modalEl = document.getElementById('minigame-modal');
        const feedbackContainer = document.getElementById('minigame-feedback');

        if (headerEl) headerEl.innerText = this.currentPuzzle.title;
        if (clueEl) clueEl.innerText = this.currentPuzzle.description;
        if (feedbackContainer) feedbackContainer.style.display = 'none';

        // Set difficulty
        const diff = config.difficulty || difficultyTier || 1;
        const dotMap = { 1: 3, 2: 5, 3: 7 };
        this.currentPuzzle.level = dotMap[diff] || 3;

        const levelKey = diff.toString();
        const possibleScenarios = this.currentPuzzle.scenarios[levelKey];

        if (possibleScenarios) {
            const randomIndex = Math.floor(Math.random() * possibleScenarios.length);
            this.currentPuzzle.activeScenario = possibleScenarios[randomIndex];
        }

        // 6. Final UI Trigger
        if (modalEl) modalEl.style.display = 'flex';
        document.getElementById('minigame-display').style.display = 'block';
        document.getElementById('minigame-buttons').style.display = 'block';

        if (this.currentPuzzle.type !== "discretion_check") {
            this.startTimer(this.currentPuzzle.timeLimit || 10);
        }

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

    // ==========================================
    // MODULE 3: SPEED TAPPING
    // ==========================================
    initDiscretionCheck() {
        // 1. Pick the scenario based on the difficulty tier we already set in start()
        const difficulty = this.currentPuzzle.level === 3 ? "3" : (this.currentPuzzle.level === 5 ? "2" : "1");
        const scenarios = this.currentPuzzle.scenarios[difficulty];
        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        
        // Store the sequence to validate against
        this.currentPuzzle.activeSequence = scenario.sequence;
        this.currentPuzzle.maxMistakes = this.currentPuzzle.settings.mistakeLimit[difficulty];
        this.currentPuzzle.mistakesMade = 0;

        // 2. Update UI
        document.getElementById('minigame-clue').innerText = scenario.clue;
        const btnContainer = document.getElementById('minigame-buttons');
        btnContainer.innerHTML = '';

        // 3. Create Gesture Buttons
        const gestures = ["PUSH_DOWN", "ROTATE_LEFT", "ROTATE_RIGHT", "PAUSE"];
        gestures.forEach(action => {
            const btn = document.createElement('button');
            btn.innerText = action.replace('_', ' ');
            btn.onclick = () => this.validateGesture(action);
            btnContainer.appendChild(btn);
        });
    }

    validateGesture(action) {
        const expected = this.currentPuzzle.activeSequence[this.playerSequence.length];

        if (action === expected) {
            this.playerSequence.push(action);
            console.log("Correct gesture!");

            // Success check
            if (this.playerSequence.length === this.currentPuzzle.activeSequence.length) {
                this.endMiniGame(true);
            }
        } else {
            this.currentPuzzle.mistakesMade++;
            console.log("Mistake!", this.currentPuzzle.mistakesMade);

            if (this.currentPuzzle.mistakesMade >= this.currentPuzzle.maxMistakes) {
                this.endMiniGame(false);
            }
        }
    }

    async handleOptionClick(option) {
        // 1. Inventory Check: Does the player have the required item?
        if (option.requiredItem && !this.player.inventory.includes(option.requiredItem)) {
            alert(`You need: ${option.requiredItem} to do this!`);
            return;
        }

        // 2. Inventory Action: Does this choice cost an item to perform?
        if (option.costItem) {
            const removed = this.removeItem(option.costItem);
            if (!removed) {
                console.error("❌ Could not remove cost item:", option.costItem);
                return; // Stop if the transaction fails
            }
        }

        // 3. Handle Mini-Game path
        if (option.miniGame) {
            this.miniGameEngine.start(
                option.miniGame, 
                null, 
                (result) => {
                    const nextScene = result ? option.miniGame.onSuccess : option.miniGame.onFailure;
                    
                    // If the mini-game result implies a consumption policy
                    if (option.miniGame.consumptionPolicy === "both" || 
                    (result && option.miniGame.consumptionPolicy === "success") ||
                    (!result && option.miniGame.consumptionPolicy === "failure")) {
                        
                        // You could trigger an inventory removal here based on the mini-game result
                        if (option.requiredItem) this.removeItem(option.requiredItem);
                    }

                    if (nextScene) {
                        this.loadScene(nextScene);
                    } else {
                        console.error("❌ No path defined in miniGame for result:", result);
                    }
                }
            );
        } 
        // 4. Standard scene transition
        else if (option.nextScene) {
            this.loadScene(option.nextScene);
        } 
        // 5. Fallback/Error
        else {
            console.warn("⚠️ Option has no miniGame and no nextScene:", option);
        }
    }
    /**
     * Clean Closing Sequence with Scenario Branching
     */
    endMiniGame(isCorrect) {
        if (!this.isGameActive) return;
        this.isGameActive = false;
        clearInterval(this.timer);

        const feedbackEl = document.getElementById('minigame-feedback-text');
        const container = document.getElementById('minigame-feedback');
        
        // Use the parameter 'isCorrect' here
        const message = isCorrect 
            ? (this.currentPuzzle.successText || "Success!") 
            : (this.currentPuzzle.failText || "Failed!");

        // Inject the text into the correct element
        if (feedbackEl) {
            feedbackEl.innerText = message;
        }

        // Show the container, hide the game elements
        if (container) {
            container.style.display = 'block';
        }
        
        // Check your HTML for this ID; if it doesn't exist, this line will throw an error!
        const runeContainer = document.getElementById('minigame-runes-container');
        if (runeContainer) {
            runeContainer.style.display = 'none';
        }

        // Pass the boolean back
      setTimeout(() => {
        document.getElementById('minigame-modal').style.display = 'none'; // Close modal
        
        if (this.onComplete) {
            this.onComplete(isCorrect);
        }
    }, 2000);
    }
}

class Player {
    constructor(name) {
        this.name = name;
        this.inventory = [];
        this.maxInventoryCount = 3;
    }

    // Logic for items
    addItem(item) {
        if (!item) return false;
        
        // Normalize to an array
        const itemsToAdd = Array.isArray(item) ? item : [item];

        // Check capacity: Are we adding more than we have room for?
        if (this.inventory.length + itemsToAdd.length > this.maxInventoryCount) {
            console.warn("🎒 Backpack is full!");
            alert("Your backpack is too full to carry those items!"); 
            return false; 
        }
                
        itemsToAdd.forEach(newItem => this.inventory.push(newItem));       
        return true;
    }

    // Inside your Player class
    removeItem(itemName) {
        const index = this.inventory.indexOf(itemName);
        
        if (index !== -1) {
            this.inventory.splice(index, 1);
            console.log(`🗑️ Item removed: ${itemName}`);
            return true;
        }
        console.warn(`⚠️ Attempted to remove non-existent item: ${itemName}`);
        return false;
    }

    // Encapsulated death check
    handleLose() {
        console.log("The journey ends here...");
        // Trigger game over logic
    }
}
// Global initialization hook
const game = new AdventureGame();
window.onload = () => game.initGame();