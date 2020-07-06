
export default {
    commandCenter: {
        name: "Command Center",
        cost: {},
        produces: {
            energy: {
                base: 100
            }
        }
    },
    harvester: {
        name: "Harvester",
        cost: {
            minerals: {
                base: 20,
                increment: 1.25
            }
        },
        produces: {
            minerals: {
                base: 2
            }
        }
    },
    solarPanel: {
        name: "Solar Panel",
        cost: {
            minerals: {
                base: 10,
                increment: 1.25
            }
        },
        produces: {
            minerals: {
                base: 1
            }
        }
    }
};