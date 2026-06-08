const fs = require('fs');

const storyData = JSON.parse(fs.readFileSync('./assets/story_fantasy.json', 'utf8'));

console.log("graph TD");

for (const [key, scene] of Object.entries(storyData)) {
    if (scene.options) {
        scene.options.forEach(opt => {
            // We use .replace(/"/g, "'") to remove internal quotes that break Mermaid
            const label = opt.text.replace(/"/g, "'"); 
            
            if (opt.nextScene) {
                console.log(`    ${key} -->|"${label}"| ${opt.nextScene}`);
            } 
            else if (opt.miniGame) {
                const success = opt.miniGame.onSuccess || "Success";
                const fail = opt.miniGame.onFailure || "Fail";
                // Adding quotes around the label fixes the parsing error
                console.log(`    ${key} -->|"${label} (Success)"| ${success}`);
                console.log(`    ${key} -->|"${label} (Fail)"| ${fail}`);
            }
        });
    }
}