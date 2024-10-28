// beer-mug-upvote.js
class BeerMugUpvote {
  constructor(postId) {
    this.postId = postId;
    this.svg = document.getElementById(`beerMugSvg-${postId}`);
    this.dragHandle = document.getElementById(`dragHandle-${postId}`);
    this.beerLiquid = document.getElementById(`beerLiquid-${postId}`);
    this.beerFoam = document.getElementById(`beerFoam-${postId}`);
    this.beerLevelText = document.getElementById(`beerLevelText-${postId}`);
    this.beerClipPath = document.getElementById(`beerClipPath-${postId}`);
    
    this.isDragging = false;
    this.beerLevel = 50;
    
    this.maxBeerHeight = 220 - 76 * 2;
    this.minBeerHeight = 280;
    
    // Store instance on SVG element for access during voting
    this.svg.__beerMugUpvote = this;
    
    this.initializeEventListeners();
    this.updateBeerVisuals();
  }

  initializeEventListeners() {
    this.svg.addEventListener('mousedown', (e) => this.handleInteractionStart(e.clientY));
    this.svg.addEventListener('mousemove', (e) => this.handleInteractionMove(e.clientY));
    this.svg.addEventListener('mouseup', () => this.handleInteractionEnd());
    
    this.svg.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleInteractionStart(e.touches[0].clientY);
    });
    
    this.svg.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.handleInteractionMove(e.touches[0].clientY);
    });
    
    this.svg.addEventListener('touchend', () => this.handleInteractionEnd());
    
    window.addEventListener('mouseup', () => this.handleInteractionEnd());
    window.addEventListener('touchend', () => this.handleInteractionEnd());
  }

  handleInteractionStart(clientY) {
    this.isDragging = true;
    this.handleInteractionMove(clientY);
  }

  handleInteractionEnd() {
    this.isDragging = false;
  }

  handleInteractionMove(clientY) {
    if (!this.isDragging) return;
    
    const svgRect = this.svg.getBoundingClientRect();
    const y = clientY - svgRect.top;
    const newLevel = Math.max(0, Math.min(100, 100 - (y / svgRect.height) * 100));
    this.beerLevel = newLevel;
    this.updateBeerVisuals();
  }

  updateBeerVisuals() {
    const beerHeight = this.minBeerHeight - (this.beerLevel / 100) * (this.minBeerHeight - this.maxBeerHeight);
    const foamHeight = this.beerLevel > 90 ? 15 : 0;

    // Update beer liquid
    const beerPath = `M60 ${beerHeight} L180 ${beerHeight} L180 280 L60 280Z`;
    this.beerLiquid.setAttribute('d', beerPath);
    this.beerClipPath.setAttribute('d', beerPath);
    
    // Update drag handle
    this.dragHandle.setAttribute('x1', '60');
    this.dragHandle.setAttribute('y1', beerHeight);
    this.dragHandle.setAttribute('x2', '180');
    this.dragHandle.setAttribute('y2', beerHeight);

    // Update foam
    if (this.beerLevel > 90) {
      this.beerFoam.style.display = '';
      const foamPath = `M60 ${beerHeight} Q75 ${beerHeight - 10} 90 ${beerHeight} T120 ${beerHeight} T150 ${beerHeight} T180 ${beerHeight} L180 ${beerHeight - foamHeight} Q165 ${beerHeight - foamHeight - 10} 150 ${beerHeight - foamHeight} T120 ${beerHeight - foamHeight} T90 ${beerHeight - foamHeight} T60 ${beerHeight - foamHeight} Z`;
      this.beerFoam.setAttribute('d', foamPath);
    } else {
      this.beerFoam.style.display = 'none';
    }

    // Update bubble visibility based on beer level
    const bubbles = this.svg.querySelectorAll('.beer-bubble');
    bubbles.forEach(bubble => {
      bubble.style.display = this.beerLevel > 0 ? '' : 'none';
    });

    // Update text
    this.beerLevelText.textContent = `Upvote weight: ${Math.round(this.beerLevel)}%`;
  }
}
