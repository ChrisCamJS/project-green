import { FaSearch } from 'react-icons/fa';
import './SearchBar.css';

const SearchBar = ({ value, handleSearch, clearSearch }) => {
  return (
    <div className="search-wrapper">
      <FaSearch className="search-icon" />
      <input
        type="text"
        placeholder="Search articles..."
        value={value}
        onChange={handleSearch}
        className="search-input"
      />
      {value && (
        <span className="clear-btn" onClick={clearSearch} title="Clear search">X</span>
      )}
    </div>
  );
};

export default SearchBar;