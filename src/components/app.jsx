import React from 'react';

// import Outside from "./outside";
import Outside from "./outside";
import Structures from "./structures";
import ResourceBar from "./resource_bar";
import Log from "./log";
import PlanetStatus from "./planet_status";
import NavigationTabs from "./navigation_tabs";
import Planet from "./planet";
import PlanetTools from "./planet_tools";
import Star from "./star";
import BlockPointerEvents from "./block_pointer_events";
import {connect} from "react-redux";
import GameOver from "./game_over";
import Settings from "./settings";
import Error from "./error";
import {getStructure} from "../redux/modules/structures";
import CommandCenter from "./structures/command_center";
import PlanetPanels from "./planet_panels";
import Keyboard from "./ui/keyboard";

// Dead equipment glimpsed in the dark before the facility powers up. Both pieces stay permanently,
// sitting behind the column UI (z-index -1) as background texture; they show wherever the panels
// leave empty space (e.g. below the terminal's text on the left).
// const DECOR_DEAD_MONITOR =
// `┌──────────────┐
// │ ░▒           │
// │        ▒░░   │
// │   ░          │
// └──────┬───────┘
//        │
//   ─────┴─────`;
const DECOR_DEAD_MONITOR =
`┌──◆───────◆──────◆┬─────────◆┬─────────┐
│══╗      ╔╪╗      └┐         └┐        │
│  ╚══════╝│║       └┐         └┐       │
│  │       │║        └┐         └─┐     ║
│  │       │║        ╔═╦══════════╗  ╔═╗║
│  │       │║║       ║▒║▓▓▓▓▓▓▓▓▓▓╬══╣‗╠╬
└──◆───────◆╫╫───────╚═╩══════════╝  ╚╬╝■
            ║║                        ║  
           ═╬╬════╗                   ║  
            ║╚═╦═╦╝                   ║  
          ╔════╝ ║                    □  
          ║ ║    ║                       
          ║ ║    ║                       
          ╠═╩════╗                       
          ║░░░░░░║                       
          ║░░░░░░║                       
          ╚══════╝                       `;

// const DECOR_BROKEN_PANELS =
// `┌────────┬────────┐
// │        │  ░     │
// │   ░    │      ▒ │
// ├────────┼──╥─────┤
// │        │  ║     │
// │  ▒     │  ╚═╗   │
// └────────┴────║───┘
//               ║
//               ╚═╕`;

const DECOR_BROKEN_PANELS =
`               ━━━━━━━   
                 ║║║     
                 ║║║     
    ┃            ║║║     
  ┌┏┻┓───────────╨╨╨──┐  
  ━┫ ┣━               │  
  │┗┳┛            ○○○ │  
  │ ┃                 │  
  │                   │  
  │        ║          │  
  │        ║ ║        │  
  │        ║ ║        │  
  │ ┃      ║ ║        │  
  │ ┃      ║ ║        │  
  │┏┛      ║ ║        │  
  └┃───────║─║────────┘  
   ┃       ╚╗║           
   ┃        ║║           
   ┃        ║║           
   ┃        ║║           
   ┃        ║║           
   ┃        ║╚═══════╗   
   ┃        ════════╗║   
   ┃                ║║   
   ┃                ║║   
   ┃             ╔══╝║   
   ┃             ║   ║   
 ┏━━━━━━┓        ║   ║   
 ┃ ┃  ┃ ┃        ║   ║   
 ┃┏┻┓┏┻┓┃        +   ║   
 ┃┃ ┃┃ ┃┃━┓      ║   ║┃┃┃
 ┃┃ ┃┃ ┃┃ ┗┓     ╚╗  ║┃┃┃
 ┃┗┳┛┗┳┛┃  ┗━┓    ║  ║┃┃┃
 ┃ ┃  ┃ ┃    ┗━━┓ ║  ║┃┃┃
 ┗━━━━━━┛       ┗━━━━━┛  
   ┃                     
   ┃                     
   ┃                     
   ┃                     
   ┃                     
   ┃                     
   ━━━┓ ┏━┓              
   ┃┏━━━━┏┛              
━━━┛━━┗━━┛━━┏┓━          
         ┏━━┃┃━━━━━━━━┓  
         ┃  ┃┃        ┃  
         ┃  ┃┃        ┃  
         ┃  ┃┃        ┃  
         ┗━━┃┃┏┓━━━━━┏┓  
         ┏━━┃┃┃┃━━━━━┃┃  
         ┗━━┃┃┃┃━━━━━┃┃  
         ┏━━┃┃┃┃━━━━━┃┃  
         ┗━━┃┛┗┃━━━━━┗┛  
           ┃┃  ┗━━━┃┃┃   
           ┗┛      ┃┃┃   
╔ ═ ═╔═╗          ┏━┃┛   
     ║ ║          ┃┃┃    
║ ╔═ ║═║╗         ┃┃┃    
     ║ ║║         ┃┃┃    
║ ║  ║ ║          ┃┃┃    
  ║  ║ ║║         ┃┃┃    
╚    ║ ║║         #┃┃    
  ║  ║╔╝           ┃┃    
  ╚ ═║║────────━┓  ┃┃    
  │  ╚═╗ │────┛ ┗┓ ║║    
  │    ╚╗│ ╔════════╝    
  │     ╚│═╝ ┗┓ ┏┛       
  │      │    ┗━┛        
  │      │               
┌─+┐     │               
│┌─│     │               
││││     │    ┏━┓  ┏━┓   
││└│     └──━━┫ ┣━━┫ ┣━  
││││          ┗━┛  ┗━┛   
││││                     
└┘ │                     
   │┐                    
   ││                    
   ╭║──╮                 
   │║  │───╮             
   │║  │   │             
   ╰║──╯   │             
  ╭─║╭─────╮             
  │ ║│║║═══│             
  │ ║│║║═══│             
  ╰─║╰─────╯             
    ═║║║════╗            
    ═║║║═════╗           
            ║║           
            ║║           
         ┏━══════━┓      
         ┃  ▲▲ ▲  ┃      
         ┃  ║║ ║  ┃      
         ┃  ▼▼ ▼  ┃      `


class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {};
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        // Log error & react component stack. Without this, the error boundary can swallow the real exception
        console.error('Caught by App error boundary:', error);
        console.error('Component stack:', info && info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return <Error />
        }

        if (this.props.gameOver) {
            return <GameOver />
        }

        let containerClass = '';
        containerClass += (this.props.hideUI ? ' hide-ui' : '');
        containerClass += (this.props.hideCanvas ? ' hide-canvas' : '');
        containerClass += (this.props.fadeToBlack ? ' fade-to-black' : '');

        return (
            <div id="app-container"
                 className={containerClass}>
                {/* Bar chrome (background + border) always shows; the contents reveal themselves progressively */}
                <div className="top-bar">
                    <ResourceBar/>
                    <PlanetStatus/>
                    <Settings/>
                </div>
                <div className="main-columns">
                    <div className="left-column">
                        {
                            // CSS-hidden (not unmounted) off the base tab so the energy button canvas survives tab switches
                            this.props.commandCenterLoaded &&
                            <div className={`command-center-slot ${this.props.currentNavTab === 'planet' ? 'hidden' : ''}`}>
                                <CommandCenter/>
                            </div>
                        }
                        <PlanetPanels/>
                        <Log/>
                        <pre className="ascii-decor decor-left">{DECOR_DEAD_MONITOR}</pre>
                    </div>
                    <div className="center-column">
                        <Outside/>
                        <Planet/>
                        <Star/>
                        <NavigationTabs/>
                    </div>
                    <div className="right-column">
                        <Structures/>
                        <PlanetTools/>
                        <pre className="ascii-decor decor-right">{DECOR_BROKEN_PANELS}</pre>
                    </div>
                </div>
                <div id={"tooltip-container"}></div>
                <BlockPointerEvents/>
                <Keyboard/>
            </div>
        );
    }
}

const mapStateToProps = state => {
    return {
        commandCenterLoaded: !!getStructure(state.structures, 'commandCenter'),
        currentNavTab: state.game.currentNavTab,
        hideUI: state.game.hideUI,
        hideCanvas: state.game.hideCanvas,
        fadeToBlack: state.game.fadeToBlack,
        gameOver: state.game.gameOver
    }
};

export default connect(
    mapStateToProps,
    {}
)(App);
