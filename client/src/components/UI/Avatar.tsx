import React, { useState, useEffect } from 'react';
import { getInitials } from '../../utils/initials';

interface AvatarProps {
    src?: string | null;
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    className?: string;
    initialsClassName?: string;
    size?: string;
}

const Avatar: React.FC<AvatarProps> = ({
    src,
    firstName,
    lastName,
    name,
    email,
    className = "",
    initialsClassName = "",
    size = "w-9 h-9"
}) => {
    // Treat "null" or "undefined" as strings like null
    const effectiveSrc = (src && src !== 'null' && src !== 'undefined') ? src : null;
    const [imgError, setImgError] = useState(false);

    // If source changes, we MUST try to load the new image
    // we use a key on the img tag to force a retry if effectiveSrc changes
    useEffect(() => {
        setImgError(false);
    }, [effectiveSrc]);

    const initials = getInitials(firstName, lastName, name, email);

    return (
        <div className={`${size} rounded-full overflow-hidden flex items-center justify-center shrink-0 transition-all ${className}`}>
            {effectiveSrc && !imgError ? (
                <img
                    key={effectiveSrc}
                    src={effectiveSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => {
                        console.error('Avatar load failed:', effectiveSrc);
                        setImgError(true);
                    }}
                />
            ) : (
                <div className={`w-full h-full flex items-center justify-center font-bold text-white uppercase antialiased ${initialsClassName}`}>
                    {initials}
                </div>
            )}
        </div>
    );
};

export default Avatar;
