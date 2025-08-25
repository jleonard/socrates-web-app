import React from "react";

interface LocationModalProps {
  onAllow: () => void;
  onClose: () => void;
}

const LocationModal: React.FC<LocationModalProps> = ({ onAllow, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full mx-4 p-6">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Enable Location Access.
          </h3>

          <p className="text-gray-600 mb-6">
            Ayapi works better when it knows where you are. This helps provide
            relevant information about your current location, like museums,
            galleries, or cultural sites nearby.
          </p>

          <div className="flex flex-col space-y-3">
            <button
              onClick={onAllow}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Allow Location Access
            </button>

            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Continue Without Location
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            You can change this setting anytime in your browser preferences.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LocationModal;
