import React from 'react';
import './Paginator.css';

/**
 * Paginator Component
 * Now with a sliding window and buttery smooth scrolling.
 * @param {number} totalItems - The full length of your data array
 * @param {number} itemsPerPage - How many items you want per page
 * @param {number} currentPage - The current active page state
 * @param {function} onPageChange - State updater function from the parent
 * @param {number} maxVisiblePages - How many numbered buttons to show at once
 */
const Paginator = ({ totalItems, itemsPerPage, currentPage, onPageChange, maxVisiblePages = 5 }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) return null;

    // --- Sliding Window Maths ---
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;

    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    const pageNumbers = [];
    for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
    }

    // --- Scroll Handler ---
    const handlePageClick = (page) => {
        onPageChange(page);
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    return (
        <nav className="paginator-nav" aria-label="Pagination">
            <ul className="paginator-list">
                {/* Previous Button */}
                <li>
                    <button 
                        onClick={() => handlePageClick(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="paginator-btn nav-btn"
                    >
                        &laquo; Prev
                    </button>
                </li>

                {/* Left Ellipsis */}
                {startPage > 1 && (
                    <li><span className="paginator-ellipsis">...</span></li>
                )}

                {pageNumbers.map(number => (
                    <li key={number}>
                        <button 
                            onClick={() => handlePageClick(number)}
                            className={`paginator-btn ${currentPage === number ? 'active' : ''}`}
                            aria-current={currentPage === number ? 'page' : undefined}
                        >
                            {number}
                        </button>
                    </li>
                ))}

                {/* Right Ellipsis */}
                {endPage < totalPages && (
                    <li><span className="paginator-ellipsis">...</span></li>
                )}

                {/* Next Button */}
                <li>
                    <button 
                        onClick={() => handlePageClick(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="paginator-btn nav-btn"
                    >
                        Next &raquo;
                    </button>
                </li>
            </ul>
        </nav>
    );
};

export default Paginator;