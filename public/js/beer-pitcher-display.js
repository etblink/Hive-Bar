// beer-pitcher-display.js
class BeerPitcher {
  constructor(votingPower) {
    this.svg = document.getElementById('beerPitcherSvg');
    this.liquid = document.getElementById('beerLiquid');
    this.foam = document.getElementById('beerFoam');
    this.infoText = document.getElementById('pitcherInfo');
    this.fillPercentage = votingPower;
    this.updatePitcher();
  }

  updatePitcher() {
  // Base Y position at bottom of pitcher
  const baseY = 226;
  // Maximum height the liquid can reach
  const maxHeight = 158; // Adjusted for pitcher height
  // Calculate liquid Y position based on voting power
  const liquidY = baseY - (maxHeight * this.fillPercentage) / 100;

    // Update liquid path - Make sure the path closes properly
    const liquidPath = `
      M120 ${liquidY}
      C${120 + (86 * this.fillPercentage) / 100} ${liquidY},
       ${206 - (86 * this.fillPercentage) / 100} ${liquidY},
       206 ${liquidY}
      L206 226
      L120 226
      Z`;
    this.liquid.setAttribute('d', liquidPath);

    // Update foam path - Make it slightly curved
    const foamPath = `
      M120 ${liquidY}
      C${120 + (86 * this.fillPercentage) / 100} ${liquidY - 5},
       ${206 - (86 * this.fillPercentage) / 100} ${liquidY - 5},
       206 ${liquidY}`;
    this.foam.setAttribute('d', foamPath);

    // Update aria description
    this.svg.setAttribute('aria-label', `Beer pitcher showing ${this.fillPercentage}% voting power`);
    
    // Update info text
    if (this.infoText) {
      this.infoText.textContent = `${this.fillPercentage.toFixed(1)}%`;
    }

    // Update bubble visibility based on fill level
      const bubbleGroup = document.getElementById('bubbleGroup');
      if (bubbleGroup) {
        bubbleGroup.style.display = this.fillPercentage > 0 ? 'block' : 'none';
      }
    }

  setVotingPower(newPower) {
      this.fillPercentage = Math.min(100, Math.max(0, newPower));
      this.updatePitcher();
    }
  }

// Initialize the pitcher when content is loaded via HTMX
document.addEventListener('htmx:afterSwap', (event) => {
  const svg = document.getElementById('beerPitcherSvg');
  if (svg) {
    const votingPower = parseFloat(svg.dataset.votingPower) || 0;
    window.beerPitcher = new BeerPitcher(votingPower);
  }
});

// Example function to update voting power
function updateVotingPower(newPower) {
  if (window.beerPitcher) {
    window.beerPitcher.setVotingPower(newPower);
  }
}
