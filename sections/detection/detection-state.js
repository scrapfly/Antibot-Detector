class DetectionUIStateMachine {
  constructor(initialState = 'empty') {
    this.state = initialState;
  }

  setState(nextState, meta = null) {
    if (this.state === nextState) {
      return false;
    }
    this.state = nextState;
    return true;
  }

  getState() {
    return this.state;
  }
}

const DetectionUIStates = {
  EMPTY: 'empty',
  LOADING: 'loading',
  ANALYZING: 'analyzing',
  RESULTS: 'results',
  DISABLED: 'disabled',
  INTERRUPTED: 'interrupted'
};

if (typeof window !== 'undefined') {
  window.DetectionUIStateMachine = DetectionUIStateMachine;
  window.DetectionUIStates = DetectionUIStates;
} else if (typeof self !== 'undefined') {
  self.DetectionUIStateMachine = DetectionUIStateMachine;
  self.DetectionUIStates = DetectionUIStates;
}
