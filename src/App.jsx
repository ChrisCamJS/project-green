import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import RecipeDetails from './pages/RecipeDetails';
import WellnessTools from './pages/WellnessTools';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import EditRecipe from './pages/EditRecipe';
import EmmasRecipeEngine from './pages/Engine'; 
import './App.css'

function App() {
  

  return (
    <>
      <Router>
        <Layout>
            <Routes>
              <Route path='/' element={<Home />} />
              <Route path='/recipe/:id' element={<RecipeDetails />} />
              <Route path='/wellness' element={<WellnessTools />} />
              
              {/* Protect the admin routes */}
              <Route element={<ProtectedRoute adminOnly={true} />}>
                <Route path='/admin' element={<AdminDashboard />} />
                <Route path='/admin/edit/:id' element={<EditRecipe />} />
              </Route>

              {/* Protect the Premium Engine route! */}
              <Route element={<ProtectedRoute premiumOnly={true} />}>
                <Route path='/engine' element={<EmmasRecipeEngine />} />
              </Route>

              <Route path='/login' element={<Login />} />
              <Route path='*' element={<h2>404: Oh My Goodness Gracious, Child - Page Not Found</h2>} />
            </Routes>
        </Layout>
      </Router>
    </>
  );
}

export default App;