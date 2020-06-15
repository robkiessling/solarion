import React from 'react';
import Clock from "./clock";
import Toggle from "./toggle";
import NumberList from "./number_list";

export default class App extends React.Component {
    render() {
        return (
            <div>
                <h1 className="hello-world">Hello, world!</h1>
                <h2>
                    <Clock />
                </h2>
                <Toggle/>
                <NumberList numbers={[1,2,3,4,5]}/>
            </div>
        );
    }
}
