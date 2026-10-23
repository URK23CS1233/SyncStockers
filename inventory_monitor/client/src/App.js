import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Switch, Link } from 'react-router-dom';
import axios from 'axios';

function App() {
    const [inventory, setInventory] = useState([]);
    const [newInventory, setNewInventory] = useState({ product_name: '', product_type: '', location: '', stock_level: ''
});

    useEffect(() => {
        fetchInventory();
    }, []);

    const fetchInventory = async () => {
        try {
            const response = await axios.get('http://localhost:5000/inventory');
            setInventory(response.data);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        }
    };

    const handleAddInventory = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('http://localhost:5000/inventory', newInventory);
            setInventory([...inventory, response.data]);
            setNewInventory({ product_name: '', product_type: '', location: '', stock_level: '' });
        } catch (error) {
            console.error('Error adding inventory:', error);
        }
    };

    const handleUpdateInventory = async (id, updatedInventory) => {
        try {
            const response = await axios.put(`http://localhost:5000/inventory/${id}`, updatedInventory);
            const updatedInventoryList = inventory.map(item => (item.id === id ? response.data : item));
            setInventory(updatedInventoryList);
        } catch (error) {
            console.error('Error updating inventory:', error);
        }
    };

    const handleDeleteInventory = async (id) => {
        try {
            await axios.delete(`http://localhost:5000/inventory/${id}`);
            const updatedInventoryList = inventory.filter(item => item.id !== id);
            setInventory(updatedInventoryList);
        } catch (error) {
            console.error('Error deleting inventory:', error);
        }
    };

    return (
        <Router>
            <div>
                <nav>
                    <ul>
                        <li>
                            <Link to="/">Home</Link>
                        </li>
                        <li>
                            <Link to="/inventory">Inventory</Link>
                        </li>
                    </ul>
                </nav>

                <Switch>
                    <Route path="/inventory">
                        <h1>Inventory</h1>
                        <form onSubmit={handleAddInventory}>
                            <input
                                type="text"
                                value={newInventory.product_name}
                                onChange={(e) => setNewInventory({ ...newInventory, product_name: e.target.value })}
                                placeholder="Product Name"
                            />
                            <input
                                type="text"
                                value={newInventory.product_type}
                                onChange={(e) => setNewInventory({ ...newInventory, product_type: e.target.value })}
                                placeholder="Product Type"
                            />
                            <input
                                type="text"
                                value={newInventory.location}
                                onChange={(e) => setNewInventory({ ...newInventory, location: e.target.value })}
                                placeholder="Location"
                            />
                            <input
                                type="number"
                                value={newInventory.stock_level}
                                onChange={(e) => setNewInventory({ ...newInventory, stock_level:
parseFloat(e.target.value) })}
                                placeholder="Stock Level"
                            />
                            <button type="submit">Add Inventory</button>
                        </form>
                        <ul>
                            {inventory.map(item => (
                                <li key={item.id}>
                                    {item.product_name} - {item.product_type} - {item.location} - {item.stock_level}
                                    <button onClick={() => handleUpdateInventory(item.id, { ...item, stock_level:
item.stock_level + 1 })}>Increase Stock</button>
                                    <button onClick={() => handleUpdateInventory(item.id, { ...item, stock_level:
item.stock_level - 1 })}>Decrease Stock</button>
                                    <button onClick={() => handleDeleteInventory(item.id)}>Delete</button>
                                </li>
                            ))}
                        </ul>
                    </Route>
                    <Route path="/">
                        <h1>Welcome</h1>
                    </Route>
                </Switch>
            </div>
        </Router>
    );
}

export default App;