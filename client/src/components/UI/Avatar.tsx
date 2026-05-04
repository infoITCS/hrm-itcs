import React, { useState, useEffect } from 'react';
import { getInitials } from '../../utils/initials';
import { api } from '../../utils/api';

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
    const [finalSrc, setFinalSrc] = useState<string | null>(null);

    // If source changes, we load the image via authenticated fetch if it's internal
    useEffect(() => {
        setImgError(false);
        const controller = new AbortController();
        const objectUrlRef = { current: null as string | null };
        let isMounted = true;

        const loadAvatar = async () => {
            if (!effectiveSrc) {
                if (isMounted) setFinalSrc(null);
                return;
            }

            const isInternalPath = effectiveSrc.startsWith('/api/');
            const isInternalFullURL = effectiveSrc.startsWith(api.baseURL);

            // If it's an internal path, use authenticated fetch to avoid leaking token in URL
            if (isInternalPath || isInternalFullURL) {
                const token = localStorage.getItem('token');
                if (!token) {
                    if (isMounted) setImgError(true);
                    return;
                }

                try {
                    let absoluteUrl = effectiveSrc;
                    if (isInternalPath) {
                        absoluteUrl = `${api.baseURL.replace(/\/+$/, '')}/${effectiveSrc.replace(/^\/+/, '')}`;
                    }

                    const response = await fetch(absoluteUrl, {
                        signal: controller.signal,
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (response.ok) {
                        const blob = await response.blob();
                        const url = URL.createObjectURL(blob);
                        objectUrlRef.current = url;
                        if (isMounted) setFinalSrc(url);
                    } else {
                        if (isMounted) setImgError(true);
                    }
                } catch (err: any) {
                    if (err.name !== 'AbortError' && isMounted) {
                        setImgError(true);
                    }
                }
                return;
            }

            // Fallback for external or non-authenticated paths
            if (isMounted) setFinalSrc(effectiveSrc);
        };

        loadAvatar();

        // Cleanup: Revoke object URL to avoid memory leaks
        return () => {
            isMounted = false;
            controller.abort();
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
            }
        };
    }, [effectiveSrc]);

    const initials = getInitials(firstName, lastName, name, email);

    return (
        <div className={`${size} rounded-full overflow-hidden flex items-center justify-center shrink-0 transition-all ${className}`}>
            {finalSrc && !imgError ? (
                <img
                    src={finalSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
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
